import { readFile } from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/db'

type Snapshot = {
  version: number
  exportedAt: string
  tables: {
    users: Prisma.UserCreateManyInput[]
    conversations: Prisma.ConversationCreateManyInput[]
    messages: Prisma.MessageCreateManyInput[]
    graphNodes: Prisma.GraphNodeCreateManyInput[]
    graphEdges: Prisma.GraphEdgeCreateManyInput[]
    messageNodes: Prisma.MessageNodeCreateManyInput[]
    conversationNodes: Prisma.ConversationNodeCreateManyInput[]
    nodeContextVersions: Prisma.NodeContextVersionCreateManyInput[]
  }
}

const inputPath = process.argv[2] ?? 'prisma/seed-data/dev-snapshot.json'

async function main() {
  const snapshot = JSON.parse(await readFile(inputPath, 'utf8')) as Snapshot
  if (snapshot.version !== 1) {
    throw new Error(`Unsupported snapshot version: ${snapshot.version}`)
  }

  const tables = snapshot.tables

  await prisma.$transaction(async (tx) => {
    await tx.messageNode.deleteMany()
    await tx.conversationNode.deleteMany()
    await tx.nodeContextVersion.deleteMany()
    await tx.message.deleteMany()
    await tx.conversation.deleteMany()
    await tx.graphEdge.deleteMany()
    await tx.graphNode.deleteMany()

    if (tables.users.length > 0) {
      await tx.user.createMany({ data: tables.users, skipDuplicates: true })
    }
    if (tables.conversations.length > 0) {
      await tx.conversation.createMany({ data: tables.conversations })
    }
    if (tables.graphNodes.length > 0) {
      await tx.graphNode.createMany({ data: tables.graphNodes })
    }
    if (tables.messages.length > 0) {
      await tx.message.createMany({ data: tables.messages })
    }
    if (tables.graphEdges.length > 0) {
      await tx.graphEdge.createMany({ data: tables.graphEdges })
    }
    if (tables.messageNodes.length > 0) {
      await tx.messageNode.createMany({ data: tables.messageNodes })
    }
    if (tables.conversationNodes.length > 0) {
      await tx.conversationNode.createMany({ data: tables.conversationNodes })
    }
    if (tables.nodeContextVersions.length > 0) {
      await tx.nodeContextVersion.createMany({ data: tables.nodeContextVersions })
    }
  })

  console.log(`Loaded ${inputPath}`)
  console.log(
    JSON.stringify(
      {
        users: tables.users.length,
        conversations: tables.conversations.length,
        messages: tables.messages.length,
        graphNodes: tables.graphNodes.length,
        graphEdges: tables.graphEdges.length,
        messageNodes: tables.messageNodes.length,
        conversationNodes: tables.conversationNodes.length,
        nodeContextVersions: tables.nodeContextVersions.length,
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
