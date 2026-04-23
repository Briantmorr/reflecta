import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { applyConversationMap, getConversationTags, getFullGraph, removeConversationTag } from '@/lib/graph'
import { generateConversationTags } from '@/lib/llm'
import { Message } from '@/types'

type Params = { params: { id: string } }

export async function POST(_: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { nodeRefs: { select: { nodeId: true } } },
        },
      },
    })
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (AUTH_ENABLED && conversation.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (conversation.messages.length === 0) {
      return NextResponse.json({ error: 'Conversation is empty' }, { status: 400 })
    }

    const graph = await getFullGraph({ userId })
    const messages: Message[] = conversation.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as Message['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      nodeRefs: message.nodeRefs,
    }))

    const result = await generateConversationTags({
      conversationMessages: messages,
      graph,
    })

    await applyConversationMap(result, conversation.id, { userId })

    const [updatedGraph, tags] = await Promise.all([
      getFullGraph({ userId }),
      getConversationTags(conversation.id),
    ])

    return NextResponse.json({
      tags,
      graph: updatedGraph,
    })
  } catch (err) {
    console.error('[POST /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Failed to update tags' }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    })
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (AUTH_ENABLED && conversation.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { nodeId } = await request.json()
    if (!nodeId || typeof nodeId !== 'string') {
      return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
    }

    await removeConversationTag(params.id, nodeId)

    const [updatedGraph, tags] = await Promise.all([
      getFullGraph({ userId }),
      getConversationTags(params.id),
    ])

    return NextResponse.json({
      tags,
      graph: updatedGraph,
    })
  } catch (err) {
    console.error('[DELETE /api/conversations/[id]/tags]', err)
    return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 })
  }
}
