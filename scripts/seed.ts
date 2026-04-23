/**
 * Seed Mirror's configured database with mock conversations so the psyche graph is
 * populated on first load and the demo is visually rich.
 *
 * Run with:  npm run db:seed
 */
import { prisma } from '../src/lib/db'
import { mockLLMCall } from '../src/lib/mockLLM'
import { applyConversationMap, ensureUserNode } from '../src/lib/graph'
import { deriveConversationTitle } from '../src/lib/utils'

interface SeedConversation {
  userMessages: string[]
  createdMinutesAgo: number // offset for createdAt so the list is ordered
}

const SEED_CONVERSATIONS: SeedConversation[] = [
  {
    createdMinutesAgo: 60 * 24 * 5, // 5 days ago
    userMessages: [
      "Lately I've been thinking a lot about my family. My dad has been on my mind.",
      "My mom has been stressed too, and I'm worried about both of them. My brother lives far away so I'm the one checking in.",
      "When I talk to my dad I feel both love and frustration. He's proud of me but we never really dig into the hard stuff.",
    ],
  },
  {
    createdMinutesAgo: 60 * 24 * 3, // 3 days ago
    userMessages: [
      "Work has been a lot. My boss dropped a big project on me with no warning and now I'm overwhelmed.",
      "My coworker Sarah has been helpful, but I can tell she's stressed too. The whole team feels anxious.",
      "I love what I do most days, but this week I feel drained. I keep thinking about quitting.",
    ],
  },
  {
    createdMinutesAgo: 60 * 24 * 1, // 1 day ago
    userMessages: [
      "I had dinner with my partner last night and it was the calmest I've felt in weeks. Grateful for them.",
      "We talked about our future and what we both want. I feel so much love when we have those conversations.",
      "A close friend is going through a hard time and I'm trying to be there for them without losing myself.",
    ],
  },
  {
    createdMinutesAgo: 60 * 2, // 2 hours ago
    userMessages: [
      "Been trying to get back into running. My health has been on my mind — I know I need to take better care of myself.",
      "I feel proud when I actually go for the run, but most days I just don't. Then I feel frustrated with myself.",
    ],
  },
]

async function main() {
  console.log('🔄 Resetting database…')
  await prisma.conversationNode.deleteMany()
  await prisma.messageNode.deleteMany()
  await prisma.graphEdge.deleteMany()
  await prisma.graphNode.deleteMany()
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()

  console.log('👤 Creating user node…')
  await ensureUserNode()

  console.log('💬 Seeding conversations…')

  for (const seed of SEED_CONVERSATIONS) {
    const createdAt = new Date(Date.now() - seed.createdMinutesAgo * 60 * 1000)

    // Create the conversation with a title derived from first message
    const convo = await prisma.conversation.create({
      data: {
        title: deriveConversationTitle(seed.userMessages[0]),
        createdAt,
        updatedAt: createdAt,
      },
    })

    // Walk through messages, generating assistant turns.
    let cursor = new Date(createdAt.getTime())
    const allUserText: string[] = []
    for (const userText of seed.userMessages) {
      cursor = new Date(cursor.getTime() + 30 * 1000) // 30s between messages
      allUserText.push(userText)

      await prisma.message.create({
        data: {
          conversationId: convo.id,
          role: 'user',
          content: userText,
          createdAt: cursor,
        },
      })

      const llmResult = mockLLMCall(userText)

      cursor = new Date(cursor.getTime() + 15 * 1000)
      await prisma.message.create({
        data: {
          conversationId: convo.id,
          role: 'assistant',
          content: llmResult.response,
          createdAt: cursor,
        },
      })
    }

    const conversationMap = mockLLMCall(allUserText.join(' '))
    await applyConversationMap(conversationMap, convo.id)

    // Bump conversation updatedAt to match the last message
    await prisma.conversation.update({
      where: { id: convo.id },
      data: { updatedAt: cursor },
    })

    console.log(`  ✓ "${convo.title}" — ${seed.userMessages.length} exchanges`)
  }

  const [nodeCount, edgeCount, msgCount] = await Promise.all([
    prisma.graphNode.count(),
    prisma.graphEdge.count(),
    prisma.message.count(),
  ])

  console.log('')
  console.log(`📊 Graph: ${nodeCount} nodes, ${edgeCount} edges`)
  console.log(`💬 Total messages: ${msgCount}`)
  console.log('✨ Seeding complete')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
