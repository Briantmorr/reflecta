import fs from 'node:fs'
import path from 'node:path'
import { getFirebaseAdminDb } from '@/lib/firebaseAdmin'

export type PromptKey =
  | 'mirror_persona'
  | 'conversation_turn'
  | 'conversation_tagger'
  | 'node_insights'

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

  const db = getFirebaseAdminDb()
  if (!db) throw new Error('Firebase Admin is not configured')

  const now = new Date().toISOString()
  const configRef = db.collection('promptConfigs').doc(key)
  const versionRef = configRef.collection('versions').doc()
  const version: PromptVersion = {
    id: versionRef.id,
    key,
    content,
    label: label?.trim() || null,
    createdAt: now,
    createdBy: createdBy?.trim() || null,
  }

  await db.runTransaction(async (transaction) => {
    transaction.set(versionRef, version)
    transaction.set(
      configRef,
      {
        activeVersionId: versionRef.id,
        updatedAt: now,
        updatedBy: version.createdBy,
      },
      { merge: true }
    )
  })

  return version
}

export async function activatePromptVersion(key: PromptKey, versionId: string, updatedBy?: string) {
  const db = getFirebaseAdminDb()
  if (!db) throw new Error('Firebase Admin is not configured')

  const configRef = db.collection('promptConfigs').doc(key)
  const versionRef = configRef.collection('versions').doc(versionId)
  const version = await versionRef.get()
  if (!version.exists) throw new Error('Prompt version not found')

  await configRef.set(
    {
      activeVersionId: versionId,
      updatedAt: new Date().toISOString(),
      updatedBy: updatedBy?.trim() || null,
    },
    { merge: true }
  )
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

  const db = getFirebaseAdminDb()
  if (!db) {
    return { activeVersionId: null, content: null, versions: [] }
  }

  try {
    const configRef = db.collection('promptConfigs').doc(key)
    const [configSnapshot, versionsSnapshot] = await Promise.all([
      configRef.get(),
      configRef.collection('versions').orderBy('createdAt', 'desc').limit(25).get(),
    ])

    const activeVersionId = configSnapshot.exists
      ? ((configSnapshot.data()?.activeVersionId as string | undefined) ?? null)
      : null
    const versions = versionsSnapshot.docs.map((doc) => normalizeVersion(doc.id, doc.data()))
    const activeVersion = activeVersionId
      ? versions.find((version) => version.id === activeVersionId) ??
        normalizeVersion(
          activeVersionId,
          (await configRef.collection('versions').doc(activeVersionId).get()).data()
        )
      : null

    return {
      activeVersionId,
      content: activeVersion?.content ?? null,
      versions,
    }
  } catch (error) {
    console.warn(`[promptStore] Remote prompt read failed for ${key}:`, error)
    return { activeVersionId: null, content: null, versions: [] }
  }
}

function normalizeVersion(id: string, data: FirebaseFirestore.DocumentData | undefined): PromptVersion {
  return {
    id,
    key: data?.key,
    content: typeof data?.content === 'string' ? data.content : '',
    label: typeof data?.label === 'string' ? data.label : null,
    createdAt: typeof data?.createdAt === 'string' ? data.createdAt : '',
    createdBy: typeof data?.createdBy === 'string' ? data.createdBy : null,
  } as PromptVersion
}
