import { prisma } from '../src/lib/db'

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.messageNode.deleteMany()
    await tx.conversationNode.deleteMany()
    await tx.nodeContextVersion.deleteMany()
    await tx.message.deleteMany()
    await tx.conversation.deleteMany()
    await tx.graphEdge.deleteMany()
    await tx.graphNode.deleteMany()
  })

  console.log('Cleared conversations, messages, graph nodes, graph edges, tags, and node contexts.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
