import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { prisma } from '../src/lib/db'


const outputPath = process.argv[2] ?? 'prisma/seed-data/dev-snapshot.json'

async function main() {
  const [
    users,
    conversations,
    messages,
    graphNodes,
    graphEdges,
    messageNodes,
    conversationNodes,
    nodeContextVersions,
  ] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.conversation.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.message.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.graphNode.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.graphEdge.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.messageNode.findMany(),
    prisma.conversationNode.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.nodeContextVersion.findMany({ orderBy: { createdAt: 'asc' } }),
  ])

  const snapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tables: {
      users,
      conversations,
      messages,
      graphNodes,
      graphEdges,
      messageNodes,
      conversationNodes,
      nodeContextVersions,
    },
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`)

  console.log(`Wrote ${outputPath}`)
  console.log(
    JSON.stringify(
      {
        users: users.length,
        conversations: conversations.length,
        messages: messages.length,
        graphNodes: graphNodes.length,
        graphEdges: graphEdges.length,
        messageNodes: messageNodes.length,
        conversationNodes: conversationNodes.length,
        nodeContextVersions: nodeContextVersions.length,
      },
      null,
      2
    )
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
