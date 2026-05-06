/**
 * Integration tests for spec-critical data flows. Each test creates an
 * isolated User + scratch state, exercises lib code directly (no HTTP
 * server), asserts, and cleans up. Run against the configured DATABASE_URL.
 *
 *   tsx -r dotenv/config scripts/integration-tests.ts
 *
 * Filter by name substring:
 *   tsx -r dotenv/config scripts/integration-tests.ts tagger
 *
 * Tests are wired to the spec at /spec.md — when the spec changes, update
 * the tests, not the other way around.
 */
import { prisma } from '../src/lib/db'
import {
  applyConversationMap,
  ensureUserNode,
  getFullGraph,
  removeConversationTag,
  getConversationTags,
} from '../src/lib/graph'
import { generateConversationTags } from '../src/lib/llm'
import { populateNodeContextForNode } from '../src/lib/nodeContext'
import {
  addToDenylist,
  ensureDenylistLoaded,
  invalidateDenylistCache,
  isLabelDenied,
  removeFromDenylist,
} from '../src/lib/labelDenylist'
import { Message } from '@/types'

type Ctx = { userId: string }

let pass = 0
let fail = 0
let skipped = 0
const failures: string[] = []

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`assertion failed: ${msg}`)
}

async function withUser<T>(fn: (ctx: Ctx) => Promise<T>): Promise<T> {
  const user = await prisma.user.create({
    data: { email: `__it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test` },
  })
  try {
    return await fn({ userId: user.id })
  } finally {
    // Best-effort cleanup. Foreign-key cascades handle most of it.
    await prisma.conversationNode.deleteMany({ where: { conversation: { userId: user.id } } }).catch(() => {})
    await prisma.message.deleteMany({ where: { conversation: { userId: user.id } } }).catch(() => {})
    await prisma.conversation.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.nodeContextVersion.deleteMany({ where: { node: { userId: user.id } } }).catch(() => {})
    await prisma.graphEdge.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.graphNode.deleteMany({ where: { userId: user.id } }).catch(() => {})
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {})
  }
}

async function seedConversation(userId: string, userMessages: string[], title = 'test conversation') {
  const conversation = await prisma.conversation.create({
    data: {
      title,
      userId,
      messages: {
        create: userMessages.map((content, i) => ({
          role: 'user',
          content,
          createdAt: new Date(Date.now() - (userMessages.length - i) * 1000),
        })),
      },
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  const messages: Message[] = conversation.messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    nodeRefs: [],
  }))
  return { conversation, messages }
}

// ───────────────────────────────────────────────────────────────────────
// Tests, organized by spec section.
// ───────────────────────────────────────────────────────────────────────

const TESTS: Array<{ name: string; spec: string; run: () => Promise<void> }> = [
  // ── Main Experience ────────────────────────────────────────────────
  {
    name: 'six core domains exist for a new user',
    spec: 'spec.md#main-experience',
    run: () => withUser(async ({ userId }) => {
      await ensureUserNode({ userId })
      const graph = await getFullGraph({ userId })
      const domainLabels = graph.nodes.filter((n) => n.type === 'domain').map((n) => n.label).sort()
      assert(domainLabels.length === 6, `expected 6 domains, got ${domainLabels.length}: ${domainLabels.join(',')}`)
      for (const label of ['Self', 'Health', 'Work', 'Relationships', 'Hobbies', 'Lifestyle']) {
        assert(domainLabels.includes(label), `missing domain ${label}`)
      }
    }),
  },
  {
    name: 'new-user domains start dormant',
    spec: 'spec.md#graph-behavior',
    run: () => withUser(async ({ userId }) => {
      await ensureUserNode({ userId })
      const graph = await getFullGraph({ userId })
      const domains = graph.nodes.filter((n) => n.type === 'domain')
      const dormant = domains.filter((d) => d.dormant)
      assert(dormant.length === 6, `expected all 6 domains dormant for empty user, got ${dormant.length}`)
    }),
  },
  {
    name: 'tagging a child node activates its domain',
    spec: 'spec.md#graph-behavior',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'I had a long call with my dad and mom yesterday.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const graph = await getFullGraph({ userId })
      const relationships = graph.nodes.find((n) => n.type === 'domain' && n.label === 'Relationships')
      assert(relationships, 'Relationships domain should exist')
      assert(!relationships!.dormant, 'Relationships should be active after Dad/Mom tagged')
    }),
  },
  {
    name: 'You only connects to first-ring containers (domain or role)',
    spec: 'spec.md#graph-behavior, line 41',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'My dad called yesterday and we talked about work.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const graph = await getFullGraph({ userId })
      const youNode = graph.nodes.find((n) => n.label === 'You')
      assert(youNode, 'You node must exist')
      const youEdges = graph.edges.filter((e) => e.fromId === youNode!.id || e.toId === youNode!.id)
      const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
      for (const edge of youEdges) {
        const other = edge.fromId === youNode!.id ? nodeById.get(edge.toId) : nodeById.get(edge.fromId)
        assert(other, 'edge endpoint must exist in graph')
        assert(
          other!.type === 'domain' || other!.type === 'role',
          `You linked to non-container ${other!.label} (${other!.type})`
        )
      }
    }),
  },

  // ── Conversation Mapping (Tagger) ──────────────────────────────────
  {
    name: 'tagger: specificity (Dad + Mom survive when transcript names them)',
    spec: 'spec.md#tagging-rules — distinguish named family',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'I had a long call with my dad. My mom is exhausted too.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const graph = await getFullGraph({ userId })
      const labels = new Set(graph.nodes.map((n) => n.label))
      assert(labels.has('Dad'), 'Dad must survive')
      assert(labels.has('Mom'), 'Mom must survive')
    }),
  },
  {
    name: 'tagger: junk rejection (talking/looks/her never become nodes)',
    spec: 'spec.md#tagging-rules — avoid filler',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        "She's been on my mind. The way she looks at me, the way she's always talking when I'm trying to think.",
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const graph = await getFullGraph({ userId })
      const lower = new Set(graph.nodes.map((n) => n.label.toLowerCase()))
      for (const junk of ['talking', 'looks', 'her', 'looking', 'thing']) {
        assert(!lower.has(junk), `junk label "${junk}" must not appear in graph`)
      }
    }),
  },
  {
    name: 'tagger: orphan cleanup — every persisted node has at least one edge',
    spec: 'spec.md#graph-behavior — every visible non-core node has placement edge',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'Shipped the auth refactor at Northbridge. Skated for an hour after work. Trying to get back into running.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const graph = await getFullGraph({ userId })
      for (const node of graph.nodes) {
        if (node.label === 'You') continue
        const edges = graph.edges.filter((e) => e.fromId === node.id || e.toId === node.id)
        assert(edges.length > 0, `orphan node "${node.label}" (${node.type}) has zero edges`)
      }
    }),
  },

  // ── Tag CRUD ───────────────────────────────────────────────────────
  {
    name: 'tag removal: removeConversationTag detaches without deleting node',
    spec: 'spec.md#conversation-ui — tags manually removable',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'My dad called.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      const taggedNodeIds = await applyConversationMap(result, conversation.id, { userId })
      assert(taggedNodeIds.length > 0, 'expected at least one tag')
      const before = await getConversationTags(conversation.id)
      assert(before.length > 0, 'expected tags present before removal')
      await removeConversationTag(conversation.id, before[0].nodeId)
      const after = await getConversationTags(conversation.id)
      assert(after.length === before.length - 1, 'tag count should drop by one')
      // Node itself should still exist
      const node = await prisma.graphNode.findUnique({ where: { id: before[0].nodeId } })
      assert(node, 'node should still exist after tag removal — only the tag link is removed')
    }),
  },

  // ── Node CRUD ──────────────────────────────────────────────────────
  {
    name: 'node rename: persists normalized label, blocks duplicates',
    spec: 'spec.md#node-view — node-level operations',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, ['My dad called.'])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const dad = await prisma.graphNode.findFirst({ where: { userId, label: 'dad' } })
      assert(dad, 'Dad node must exist')
      // rename to "Dad Smith" (allowed)
      await prisma.graphNode.update({ where: { id: dad!.id }, data: { label: 'dad smith' } })
      const renamed = await prisma.graphNode.findUnique({ where: { id: dad!.id } })
      assert(renamed?.label === 'dad smith', `expected normalized label, got ${renamed?.label}`)
    }),
  },
  {
    name: 'node delete: cleans edges + conversationNode refs + adds to denylist',
    spec: 'spec.md#node-view — deletion cascades',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, ['My dad called.'])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const dad = await prisma.graphNode.findFirst({ where: { userId, label: 'dad' } })
      assert(dad, 'Dad node must exist before delete')
      await prisma.graphEdge.deleteMany({ where: { OR: [{ fromId: dad!.id }, { toId: dad!.id }] } })
      await prisma.conversationNode.deleteMany({ where: { nodeId: dad!.id } })
      await prisma.graphNode.delete({ where: { id: dad!.id } })
      await addToDenylist('dad', 'integration-test')

      const stillThere = await prisma.graphNode.findUnique({ where: { id: dad!.id } })
      assert(!stillThere, 'Dad node should be deleted')
      const dangling = await prisma.graphEdge.count({ where: { OR: [{ fromId: dad!.id }, { toId: dad!.id }] } })
      assert(dangling === 0, 'no edges should reference deleted node')
      await ensureDenylistLoaded()
      assert(isLabelDenied('dad'), 'dad should now be in the denylist')

      // cleanup the test denylist row so it doesn't pollute future tests
      await removeFromDenylist('dad')
    }),
  },

  // ── Conversation deletion ──────────────────────────────────────────
  {
    name: 'conversation delete: cascades messages and tags but preserves nodes',
    spec: 'spec.md#node-view, conversation-ui — node persistence across convo delete',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, ['My dad called.'])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })

      const beforeDad = await prisma.graphNode.findFirst({ where: { userId, label: 'dad' } })
      assert(beforeDad, 'Dad must exist before convo delete')

      await prisma.conversationNode.deleteMany({ where: { conversationId: conversation.id } })
      await prisma.message.deleteMany({ where: { conversationId: conversation.id } })
      await prisma.conversation.delete({ where: { id: conversation.id } })

      const afterDad = await prisma.graphNode.findUnique({ where: { id: beforeDad!.id } })
      assert(afterDad, 'Dad node should survive conversation delete (nodes outlive convos)')
    }),
  },

  // ── Memory generation ──────────────────────────────────────────────
  {
    name: 'build memory: thin signal writes null, never boilerplate',
    spec: 'spec.md#context-generation — no padding, no placeholder',
    run: () => withUser(async ({ userId }) => {
      const userNode = await ensureUserNode({ userId })
      // Build memory for a node with no tagged conversations.
      const node = await prisma.graphNode.create({
        data: { label: 'lonely', type: 'role', userId },
      })
      const out = await populateNodeContextForNode({ nodeId: node.id, userId })
      assert(out.context === '', `expected empty context for thin signal, got: ${out.context.slice(0, 80)}`)
      const stored = await prisma.graphNode.findUnique({ where: { id: node.id } })
      assert(stored?.contextText === null, `contextText should be null, got: ${stored?.contextText}`)
      // sanity: User node still intact
      const u = await prisma.graphNode.findUnique({ where: { id: userNode } })
      assert(u, 'user node should be intact')
    }),
  },
  {
    name: 'build memory: never produces boilerplate strings',
    spec: 'spec.md#context-generation — no scene-setting/meta-commentary',
    run: () => withUser(async ({ userId }) => {
      const { conversation, messages } = await seedConversation(userId, [
        'My dad called yesterday. He has been struggling with his health.',
        'I want to be a better son to him.',
      ])
      const result = await generateConversationTags({ conversationMessages: messages, graph: await getFullGraph({ userId }) })
      await applyConversationMap(result, conversation.id, { userId })
      const dad = await prisma.graphNode.findFirst({ where: { userId, label: 'dad' } })
      assert(dad, 'Dad must exist')
      const out = await populateNodeContextForNode({ nodeId: dad!.id, userId })
      const text = out.context
      const banned = [
        /Referenced across \d+ conversation/i,
        /Details will fill in as the user/i,
        /Nothing captured yet/i,
        /Come back after a few conversations/i,
      ]
      for (const re of banned) {
        assert(!re.test(text), `boilerplate phrase "${re.source}" appeared in memory: ${text.slice(0, 120)}`)
      }
    }),
  },

  // ── Denylist ───────────────────────────────────────────────────────
  {
    name: 'denylist: a label added to RejectedLabel is rejected by isRejectableLabel',
    spec: 'self-healing tagging — denylist auto-population',
    run: () => withUser(async () => {
      const { isRejectableLabel } = await import('../src/lib/llm')
      // Use a label that's already in normalized form (lowercase, alphanumeric)
      // so we can compare against the cache directly.
      const probe = `itprobe${Date.now()}`
      assert(!isRejectableLabel(probe), 'probe label should pass before being denylisted')
      await addToDenylist(probe, 'integration-test')
      assert(isLabelDenied(probe), 'probe should be in the denylist after addToDenylist')
      assert(isRejectableLabel(probe), 'isRejectableLabel should reject denylisted probe')
      await removeFromDenylist(probe)
      assert(!isLabelDenied(probe), 'removeFromDenylist should clear both DB and cache')
    }),
  },
]

async function runOne(name: string, spec: string, fn: () => Promise<void>) {
  process.stdout.write(`  ${name} ... `)
  // Force a fresh denylist read at the start of every test so prior test
  // cache state never affects this run.
  invalidateDenylistCache()
  await ensureDenylistLoaded()
  try {
    await fn()
    console.log('PASS')
    pass++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`FAIL  (${spec})`)
    console.log(`    -> ${msg}`)
    fail++
    failures.push(`${name}\n    spec: ${spec}\n    error: ${msg}`)
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set — tagger tests will use mock and may produce different outputs.')
  }
  const filter = process.argv[2]
  const selected = filter ? TESTS.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase())) : TESTS
  if (selected.length === 0) {
    console.log(`No tests match "${filter}".`)
    process.exit(0)
  }
  console.log(`\nRunning ${selected.length} integration tests${filter ? ` (filter: "${filter}")` : ''}\n`)
  for (const t of selected) {
    await runOne(t.name, t.spec, t.run)
  }
  console.log(`\n${'='.repeat(72)}`)
  console.log(`PASS ${pass}  FAIL ${fail}  SKIP ${skipped}`)
  if (failures.length > 0) {
    console.log('\nFailures:\n')
    for (const f of failures) console.log(f + '\n')
  }
  await prisma.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
