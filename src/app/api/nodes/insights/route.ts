import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { generateNodeInsights, NodeInsightConversation, NodeInsightNodeRef } from '@/lib/llm'
import { Message, NodeType } from '@/types'

export async function POST(request: Request) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { nodeIds?: unknown } | null
    const nodeIds = Array.isArray(body?.nodeIds)
      ? [...new Set(body!.nodeIds.filter((value): value is string => typeof value === 'string' && value.length > 0))]
      : []

    if (nodeIds.length === 0) {
      return NextResponse.json({ error: 'nodeIds is required' }, { status: 400 })
    }

    const nodes = await prisma.graphNode.findMany({
      where: {
        id: { in: nodeIds },
        ...(AUTH_ENABLED ? { userId } : { userId: null }),
      },
    })
    if (nodes.length === 0) {
      return NextResponse.json({ error: 'No matching nodes' }, { status: 404 })
    }

    const nodeRefs: NodeInsightNodeRef[] = nodes.map((node) => ({
      label: node.label === 'user' ? 'You' : node.label,
      type: node.type as NodeType,
    }))

    const tagged = await prisma.conversationNode.findMany({
      where: { nodeId: { in: nodes.map((node) => node.id) } },
      select: { conversationId: true },
    })
    const conversationIds = [...new Set(tagged.map((row) => row.conversationId))]

    if (conversationIds.length === 0) {
      return NextResponse.json({
        nodeIds: nodes.map((node) => node.id),
        conversationCount: 0,
        summary: "You haven't said much that touches this yet; the picture is still forming.",
        bullets: ['Barely surfaced', 'Little signal so far', 'Needs more conversations'],
        generatedAt: new Date().toISOString(),
        persisted: false,
      })
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        id: { in: conversationIds },
        ...(AUTH_ENABLED && userId ? { userId } : {}),
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    })

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

    const insights = await generateNodeInsights({
      nodes: nodeRefs,
      conversations: payload,
    })

    const generatedAt = new Date()
    let persisted = false

    if (nodes.length === 1) {
      await prisma.graphNode.update({
        where: { id: nodes[0].id },
        data: {
          insightSummary: insights.summary,
          insightBullets: JSON.stringify(insights.bullets),
          insightGeneratedAt: generatedAt,
        },
      })
      persisted = true
    }

    return NextResponse.json({
      nodeIds: nodes.map((node) => node.id),
      conversationCount: conversations.length,
      summary: insights.summary,
      bullets: insights.bullets,
      generatedAt: generatedAt.toISOString(),
      persisted,
    })
  } catch (err) {
    console.error('[POST /api/nodes/insights]', err)
    return NextResponse.json({ error: 'Failed to generate node insights' }, { status: 500 })
  }
}
