import 'dotenv/config'
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { getImportAdapter } from '../src/lib/import'
import type { ImportedMessage } from '../src/lib/import'
import type { Message } from '../src/types'

process.env.DATABASE_URL = `file:${path.join(process.cwd(), 'prisma', 'dev.db')}`

const SUPPORTED_EXTENSIONS = new Set(['.json', '.txt', '.md'])
const ONE_DAY_MS = 86_400_000
const MESSAGE_SPACING_MS = 30_000

type Args = {
  dir: string
  force: boolean
}

type Counters = {
  imported: number
  skipped: number
  errors: number
}

let prismaForDisconnect: typeof import('../src/lib/db').prisma | null = null

async function main() {
  const [{ prisma }, { getFullGraph, applyConversationMap }, { generateImportConversationTags }] =
    await Promise.all([
      import('../src/lib/db'),
      import('../src/lib/graph'),
      import('../src/lib/llm'),
    ])
  prismaForDisconnect = prisma
  const args = parseArgs(process.argv.slice(2))
  const counters: Counters = { imported: 0, skipped: 0, errors: 0 }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('[WARN] No OPENAI_API_KEY — imported convos will tag via mock LLM')
  }

  if (args.force) {
    console.log('[INFO] Removing prior imported conversations')
    await prisma.conversation.deleteMany({
      where: { sourceRef: { not: null } },
    })
  }

  const files = await discoverFiles(args.dir)
  console.log(`[INFO] Importing ${files.length} file${files.length === 1 ? '' : 's'} from ${args.dir}`)

  for (const [index, filePath] of files.entries()) {
    const filename = path.basename(filePath)

    try {
      const rawBytes = await fs.readFile(filePath)
      const sourceRef = crypto.createHash('sha256').update(rawBytes).digest('hex')
      const existing = await prisma.conversation.findUnique({ where: { sourceRef } })
      if (existing) {
        counters.skipped += 1
        console.log(`[SKIP] ${filename} (already imported)`)
        continue
      }

      const adapter = getImportAdapter(filename)
      if (!adapter) {
        counters.skipped += 1
        console.log(`[SKIP] ${filename} (unsupported extension)`)
        continue
      }

      const parsed = adapter(rawBytes, filename)
      const importedAt = new Date()
      const createdAt = new Date(Date.now() - index * ONE_DAY_MS)
      const conversation = await prisma.conversation.create({
        data: {
          title: parsed.title,
          sourceRef,
          sourceType: parsed.sourceType,
          sourceName: parsed.sourceName,
          importedAt,
          createdAt,
          updatedAt: createdAt,
        },
      })

      const persistedMessages = await createMessages(prisma, conversation.id, parsed.messages, createdAt)
      const graph = await getFullGraph()
      const tagResult = await generateImportConversationTags({
        conversationMessages: persistedMessages,
        graph,
      })
      const taggedNodeIds = await applyConversationMap(tagResult, conversation.id)
      const tagLabels = await getTagLabels(prisma, taggedNodeIds)

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          updatedAt: persistedMessages.at(-1)?.createdAt
            ? new Date(persistedMessages.at(-1)?.createdAt as string)
            : createdAt,
        },
      })

      counters.imported += 1
      console.log(`[OK] ${filename} → tags: [${tagLabels.join(', ')}]`)
    } catch (error) {
      counters.errors += 1
      console.error(`[ERROR] ${filename}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const nodeCount = await prisma.graphNode.count()
  console.log(
    `[SUMMARY] imported=${counters.imported} skipped=${counters.skipped} errors=${counters.errors} graphNodes=${nodeCount}`
  )

  if (counters.errors > 0) {
    process.exitCode = 1
  }
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dir: 'seed_conversations', force: false }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--force') {
      args.force = true
      continue
    }

    if (arg === '--dir') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--dir requires a path')
      }
      args.dir = value
      index += 1
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return args
}

async function discoverFiles(dir: string) {
  const absoluteDir = path.resolve(process.cwd(), dir)
  const entries = await fs.readdir(absoluteDir, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .filter((entry) => SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(absoluteDir, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)))
}

async function createMessages(
  prisma: typeof import('../src/lib/db').prisma,
  conversationId: string,
  messages: ImportedMessage[],
  conversationCreatedAt: Date
): Promise<Message[]> {
  const persistedMessages = []

  for (const [index, message] of messages.entries()) {
    const createdAt = new Date(conversationCreatedAt.getTime() + index * MESSAGE_SPACING_MS)
    const persisted = await prisma.message.create({
      data: {
        conversationId,
        role: message.role,
        content: message.content,
        createdAt,
      },
      include: { nodeRefs: { select: { nodeId: true } } },
    })

    persistedMessages.push({
      id: persisted.id,
      conversationId: persisted.conversationId,
      role: persisted.role as Message['role'],
      content: persisted.content,
      createdAt: persisted.createdAt.toISOString(),
      nodeRefs: persisted.nodeRefs,
    })
  }

  return persistedMessages
}

async function getTagLabels(prisma: typeof import('../src/lib/db').prisma, nodeIds: string[]) {
  if (nodeIds.length === 0) return []

  const nodes = await prisma.graphNode.findMany({
    where: { id: { in: nodeIds } },
    select: { label: true },
    orderBy: { label: 'asc' },
  })

  return nodes.map((node) => node.label.replace(/\b\w/g, (letter) => letter.toUpperCase()))
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prismaForDisconnect?.$disconnect()
  })
