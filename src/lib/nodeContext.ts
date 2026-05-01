import { prisma } from '@/lib/db'
import { generateNodeContext, NodeInsightConversation, NodeInsightNodeRef } from '@/lib/llm'
import { Message, NodeType } from '@/types'

type BackfillNode = {
  id: string
  label: string
  type: string
  contextText: string | null
}

export type PopulateNodeContextResult = {
  nodeId: string
  label: string
  type: NodeType
  context: string
  updatedAt: string
  conversationCount: number
}

export async function populateNodeContextForNode({
  nodeId,
  userId,
  preserveExistingContext = true,
}: {
  nodeId: string
  userId?: string | null
  preserveExistingContext?: boolean
}): Promise<PopulateNodeContextResult> {
  const node = await prisma.graphNode.findUnique({
    where: { id: nodeId },
    select: { id: true, label: true, type: true, contextText: true },
  })

  if (!node) {
    throw new Error(`Node not found: ${nodeId}`)
  }

  const conversations = await getConversationsForNode(node, userId)
  const payload: NodeInsightConversation[] = conversations.map((conversation) => ({
    title: conversation.title,
    createdAt: conversation.createdAt.toISOString(),
    messages: conversation.messages.map<Message>((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as Message['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  }))

  const ref: NodeInsightNodeRef = {
    label: node.label === 'user' ? 'You' : node.label,
    type: node.type as NodeType,
  }

  const result = await generateNodeContext({
    node: ref,
    existingContext: preserveExistingContext ? node.contextText : null,
    conversations: payload,
  })

  const updatedAt = new Date()
  const trimmed = result.context.trim()
  const hasContent = trimmed.length > 0

  if (!hasContent) {
    // Nothing durable to record. Clear any prior boilerplate; do not create a
    // version row (versions track real edits, not "we tried and got nothing").
    const updated = await prisma.graphNode.update({
      where: { id: node.id },
      data: { contextText: null, contextUpdatedAt: null, contextSource: null },
    })
    return {
      nodeId: updated.id,
      label: updated.label,
      type: updated.type as NodeType,
      context: '',
      updatedAt: updatedAt.toISOString(),
      conversationCount: conversations.length,
    }
  }

  const [, updated] = await prisma.$transaction([
    prisma.nodeContextVersion.create({
      data: {
        nodeId: node.id,
        content: trimmed,
        source: 'generated',
        editedByUserId: userId ?? null,
      },
    }),
    prisma.graphNode.update({
      where: { id: node.id },
      data: {
        contextText: trimmed,
        contextUpdatedAt: updatedAt,
        contextSource: 'generated',
      },
    }),
  ])

  return {
    nodeId: updated.id,
    label: updated.label,
    type: updated.type as NodeType,
    context: updated.contextText ?? trimmed,
    updatedAt: updatedAt.toISOString(),
    conversationCount: conversations.length,
  }
}

export async function populateNodeContextForAllNodes({
  userId,
  includeEmotionNodes = false,
  preserveExistingContext = true,
}: {
  userId?: string | null
  includeEmotionNodes?: boolean
  preserveExistingContext?: boolean
} = {}) {
  const nodes = await prisma.graphNode.findMany({
    where: includeEmotionNodes ? undefined : { type: { not: 'emotion' } },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, label: true, type: true, contextText: true },
  })

  const results: PopulateNodeContextResult[] = []
  for (const node of nodes) {
    results.push(await populateNodeContextForNode({
      nodeId: node.id,
      userId,
      preserveExistingContext,
    }))
  }
  return results
}

async function getConversationsForNode(node: BackfillNode, userId?: string | null) {
  if (node.type === 'user') {
    return prisma.conversation.findMany({
      where: userId ? { userId } : undefined,
      include: { messages: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  const tagged = await prisma.conversationNode.findMany({
    where: { nodeId: node.id },
    select: { conversationId: true },
  })
  const conversationIds = [...new Set(tagged.map((row) => row.conversationId))]

  if (conversationIds.length === 0) return []

  return prisma.conversation.findMany({
    where: {
      id: { in: conversationIds },
      ...(userId ? { userId } : {}),
    },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}
