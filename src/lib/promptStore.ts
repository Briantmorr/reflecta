import fs from 'node:fs'
import path from 'node:path'
import { prisma } from '@/lib/db'

export type PromptKey =
  | 'mirror_persona'
  | 'conversation_turn'
  | 'conversation_tagger'
  | 'node_insights'
  | 'node_context'

export type PromptDefinition = {
  key: PromptKey
  label: string
  filename: string
  description: string
}

export type PromptVersion = {
  id: string
  key: PromptKey
  content: string
  label: string | null
  createdAt: string
  createdBy: string | null
}

export type PromptState = PromptDefinition & {
  activeVersionId: string | null
  activeSource: 'remote' | 'local' | 'fallback'
  content: string
  versions: PromptVersion[]
}

type PromptFile = { prompt?: string }

const promptCache = new Map<string, string>()

export const PROMPT_DEFINITIONS: PromptDefinition[] = [
  {
    key: 'mirror_persona',
    label: 'Mirror Persona',
    filename: 'mirror_persona.json',
    description: 'Shared identity, voice, boundaries, and relationship to the map.',
  },
  {
    key: 'conversation_turn',
    label: 'Conversation Turn',
    filename: 'conversation-turn.json',
    description: 'Per-message reflective replies and lightweight entity extraction.',
  },
  {
    key: 'conversation_tagger',
    label: 'Conversation Tagger',
    filename: 'conversation-tagger.json',
    description: 'Post-conversation durable node tagging and map structure.',
  },
  {
    key: 'node_insights',
    label: 'Node Insights',
    filename: 'node-insights.json',
    description: 'Synthesis shown in node summary for selected map nodes.',
  },
  {
    key: 'node_context',
    label: 'Node Context',
    filename: 'node-context.json',
    description: 'Factual memory distilled from conversations for a single node (also powers the User Profile).',
  },
]

export function getPromptDefinition(key: string) {
  return PROMPT_DEFINITIONS.find((definition) => definition.key === key)
}

export function promptEditorEnabled() {
  return process.env.ENABLE_PROMPT_EDITOR === 'true'
}

export function remotePromptsEnabled() {
  return process.env.ENABLE_REMOTE_PROMPTS === 'true'
}

export function promptEditorAuthorized(secret: string | null) {
  const configuredSecret = process.env.PROMPT_EDITOR_SECRET
  return Boolean(promptEditorEnabled() && configuredSecret && secret === configuredSecret)
}

export function readLocalPrompt(filename: string, fallback: string): string {
  const cacheKey = `local:${filename}`
  if (process.env.NODE_ENV === 'production' && promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey) ?? fallback
  }

  try {
    const filePath = path.join(process.cwd(), 'prompts', filename)
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PromptFile
    const prompt =
      typeof parsed.prompt === 'string' && parsed.prompt.trim().length > 0
        ? parsed.prompt
        : fallback

    if (process.env.NODE_ENV === 'production') {
      promptCache.set(cacheKey, prompt)
    }

    return prompt
  } catch {
    return fallback
  }
}

export async function resolvePrompt({
  key,
  filename,
  fallback,
}: {
  key: PromptKey
  filename: string
  fallback: string
}) {
  if (remotePromptsEnabled()) {
    const remote = await readRemotePrompt(key)
    if (remote) return remote
  }

  return readLocalPrompt(filename, fallback)
}

export async function listPromptStates(fallbacks: Record<PromptKey, string>): Promise<PromptState[]> {
  return Promise.all(
    PROMPT_DEFINITIONS.map(async (definition) => {
      const localContent = readLocalPrompt(definition.filename, fallbacks[definition.key])
      const remote = await readRemotePromptState(definition.key)

      return {
        ...definition,
        activeVersionId: remote.activeVersionId,
        activeSource: remote.content ? 'remote' : localContent ? 'local' : 'fallback',
        content: remote.content ?? localContent,
        versions: remote.versions,
      }
    })
  )
}

export async function createPromptVersion({
  key,
  content,
  label,
  createdBy,
}: {
  key: PromptKey
  content: string
  label?: string
  createdBy?: string
}) {
  const definition = getPromptDefinition(key)
  if (!definition) throw new Error(`Unknown prompt key: ${key}`)
  if (!content.trim()) throw new Error('Prompt content is required')

  const createdAt = new Date()
  const version = await prisma.$transaction(async (tx) => {
    await tx.promptConfig.upsert({
      where: { key },
      create: { key },
      update: {},
    })

    const created = await tx.promptVersion.create({
      data: {
        key,
        content,
        label: label?.trim() || null,
        createdBy: createdBy?.trim() || null,
        createdAt,
      },
    })

    await tx.promptConfig.update({
      where: { key },
      data: {
        activeVersionId: created.id,
        updatedAt: createdAt,
        updatedBy: created.createdBy,
      },
    })

    return created
  })

  return normalizeVersionRow(version)
}

export async function activatePromptVersion(key: PromptKey, versionId: string, updatedBy?: string) {
  const version = await prisma.promptVersion.findFirst({
    where: { id: versionId, key },
    select: { id: true },
  })
  if (!version) throw new Error('Prompt version not found')

  await prisma.promptConfig.upsert({
    where: { key },
    create: {
      key,
      activeVersionId: versionId,
      updatedAt: new Date(),
      updatedBy: updatedBy?.trim() || null,
    },
    update: {
      activeVersionId: versionId,
      updatedAt: new Date(),
      updatedBy: updatedBy?.trim() || null,
    },
  })
}

async function readRemotePrompt(key: PromptKey) {
  const state = await readRemotePromptState(key)
  return state.content
}

async function readRemotePromptState(key: PromptKey): Promise<{
  activeVersionId: string | null
  content: string | null
  versions: PromptVersion[]
}> {
  if (!remotePromptsEnabled()) {
    return { activeVersionId: null, content: null, versions: [] }
  }

  try {
    const [config, versions] = await Promise.all([
      prisma.promptConfig.findUnique({
        where: { key },
        select: { activeVersionId: true },
      }),
      prisma.promptVersion.findMany({
        where: { key },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
    ])

    const activeVersionId = config?.activeVersionId ?? null
    const normalizedVersions = versions.map(normalizeVersionRow)
    const activeVersion = activeVersionId
      ? normalizedVersions.find((version) => version.id === activeVersionId) ??
        normalizeVersionRow(
          await prisma.promptVersion.findUniqueOrThrow({
            where: { id: activeVersionId },
          })
        )
      : null

    return {
      activeVersionId,
      content: activeVersion?.content ?? null,
      versions: normalizedVersions,
    }
  } catch (error) {
    console.warn(`[promptStore] Remote prompt read failed for ${key}:`, error)
    return { activeVersionId: null, content: null, versions: [] }
  }
}

function normalizeVersionRow(version: {
  id: string
  key: string
  content: string
  label: string | null
  createdAt: Date
  createdBy: string | null
}): PromptVersion {
  return {
    id: version.id,
    key: version.key as PromptKey,
    content: version.content,
    label: version.label,
    createdAt: version.createdAt.toISOString(),
    createdBy: version.createdBy,
  }
}
