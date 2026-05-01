/**
 * Drives the tagger end-to-end against three synthetic conversations and prints
 * what nodes/edges actually got persisted. Each test creates a temp Conversation
 * + Messages under an isolated test userId so the live graph isn't polluted,
 * then deletes everything when done.
 *
 * Run with:  tsx -r dotenv/config scripts/test-tagger.ts
 */
import { prisma } from '../src/lib/db'
import { generateConversationTags } from '../src/lib/llm'
import { applyConversationMap, getFullGraph } from '../src/lib/graph'
import { Message } from '@/types'

type Test = {
  name: string
  userMessages: string[]
  expected: string
}

const TESTS: Test[] = [
  {
    name: 'Test 1 — specificity over aggregation',
    expected: 'Dad + Mom as distinct person nodes, plus Family + Relationships',
    userMessages: [
      "I had a long call with my dad yesterday. He's been struggling with his health and it's hitting me hard.",
      "I haven't been a great son to him lately and I want that to change.",
      "My mom is holding it together but I can tell she's exhausted too.",
    ],
  },
  {
    name: 'Test 2 — junk rejection',
    expected: 'NO talking/looks/her/she/thing nodes; ideally fallback to a single conversation-title or Relationships tag with no orphans',
    userMessages: [
      "She's been on my mind a lot. The way she looks at me, the way she's always talking when I'm trying to think.",
      "Her presence is just there, you know? It's been a thing.",
      "I keep going back to it.",
    ],
  },
  {
    name: 'Test 3 — multi-domain, specific over generic',
    expected: 'Northbridge / Sarah + Coworkers / Skateboarding / Running. NO Routine, NO common verbs.',
    userMessages: [
      "Long week. Shipped the auth refactor at Northbridge — Sarah on my team caught a regression at the last minute, saved us.",
      "Skated for an hour after work to clear my head.",
      "Trying to get back into a real running routine too, mornings have been slipping.",
    ],
  },
]

async function runTest(test: Test, index: number) {
  console.log(`\n${'='.repeat(72)}`)
  console.log(test.name)
  console.log(`Expected: ${test.expected}`)
  console.log('='.repeat(72))

  const testUser = await prisma.user.create({
    data: { email: `__tagger_test_${Date.now()}_${index}@example.test` },
  })
  const testUserId = testUser.id

  const conversation = await prisma.conversation.create({
    data: {
      title: test.name,
      userId: testUserId,
      messages: {
        create: test.userMessages.map((content, i) => ({
          role: 'user',
          content,
          createdAt: new Date(Date.now() - (test.userMessages.length - i) * 1000),
        })),
      },
    },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })

  const messages: Message[] = conversation.messages.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role as Message['role'],
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    nodeRefs: [],
  }))

  // Pre-tag graph (for the tagger's "current node list" context)
  const graph = await getFullGraph({ userId: testUserId })

  const llmResult = await generateConversationTags({
    conversationMessages: messages,
    graph,
  })

  console.log('\n[LLM raw entities]')
  for (const e of llmResult.entities) console.log(`  - ${e.name} (${e.type})`)
  console.log('[LLM raw relationships]')
  for (const r of llmResult.relationships) console.log(`  - ${r.from} -[${r.type}]-> ${r.to}`)

  const taggedNodeIds = await applyConversationMap(llmResult, conversation.id, { userId: testUserId })

  // Read back the full state for this user — what actually persisted
  const finalGraph = await getFullGraph({ userId: testUserId })
  const taggedSet = new Set(taggedNodeIds)
  const taggedNodes = finalGraph.nodes.filter((n) => taggedSet.has(n.id))

  console.log('\n[Persisted tags for this conversation]')
  for (const n of taggedNodes) {
    const incoming = finalGraph.edges.filter((e) => e.toId === n.id)
    const outgoing = finalGraph.edges.filter((e) => e.fromId === n.id)
    const placement = [
      ...outgoing.map((e) => `-[${e.relationship}]-> ${finalGraph.nodes.find((nn) => nn.id === e.toId)?.label}`),
      ...incoming.map((e) => `<-[${e.relationship}]- ${finalGraph.nodes.find((nn) => nn.id === e.fromId)?.label}`),
    ]
    console.log(`  - ${n.label} (${n.type})  ${placement.length ? placement.join(' | ') : '*** ORPHAN ***'}`)
  }

  console.log('\n[All visible nodes in test graph]')
  for (const n of finalGraph.nodes) {
    const edgeCount = finalGraph.edges.filter((e) => e.fromId === n.id || e.toId === n.id).length
    console.log(`  - ${n.label} (${n.type}, ${edgeCount} edges)${edgeCount === 0 && n.label !== 'You' ? '  *** ORPHAN ***' : ''}`)
  }

  // Cleanup: delete the conversation, its messages, conversation-node links,
  // and any nodes/edges owned by the test userId.
  await prisma.conversationNode.deleteMany({ where: { conversationId: conversation.id } })
  await prisma.message.deleteMany({ where: { conversationId: conversation.id } })
  await prisma.conversation.delete({ where: { id: conversation.id } })
  await prisma.graphEdge.deleteMany({ where: { userId: testUserId } })
  await prisma.graphNode.deleteMany({ where: { userId: testUserId } })
  await prisma.user.delete({ where: { id: testUserId } })
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not set. Aborting (would only run mock LLM).')
    process.exit(1)
  }

  for (let i = 0; i < TESTS.length; i++) {
    try {
      await runTest(TESTS[i], i)
    } catch (err) {
      console.error(`Test ${i + 1} FAILED:`, err)
    }
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
