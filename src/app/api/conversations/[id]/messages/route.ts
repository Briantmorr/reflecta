import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { onboardingPrompt } from '@/lib/mockLLM'
import { getFullGraph } from '@/lib/graph'
import { generateConversationTurn } from '@/lib/llm'
import { deriveConversationTitle } from '@/lib/utils'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { Message } from '@/types'

type Params = { params: { id: string } }

/**
 * Post a user message. Flow:
 *  1. Persist user message
 *  2. Run the conversation LLM turn → reply text only
 *  3. Persist assistant response
 *  4. Return both messages + current graph so the client can re-render
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { messages: true } },
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

    // 1. Persist user message
    const userMessage = await prisma.message.create({
      data: { conversationId: params.id, role: 'user', content },
    })

    // 2. LLM turn with conversation + graph context
    const currentGraph = await getFullGraph()
    const conversationMessages: Message[] = conversation.messages.map((message) => ({
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as Message['role'],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      nodeRefs: message.nodeRefs,
    }))
    const llmResult = await generateConversationTurn({
      userMessage: content,
      conversationMessages,
      graph: currentGraph,
    })

    // 3. Persist assistant message
    const assistantMessage = await prisma.message.create({
      data: { conversationId: params.id, role: 'assistant', content: llmResult.response },
    })

    // If this was the first exchange, derive a title for the conversation
    if (conversation._count.messages === 0 && !conversation.title) {
      await prisma.conversation.update({
        where: { id: params.id },
        data: { title: deriveConversationTitle(content) },
      })
    } else {
      // bump updatedAt
      await prisma.conversation.update({
        where: { id: params.id },
        data: { updatedAt: new Date() },
      })
    }

    const graph = await getFullGraph()

    return NextResponse.json({
      userMessage,
      assistantMessage,
      graph,
      touchedNodeIds: [],
    })
  } catch (err) {
    console.error('[POST /api/conversations/[id]/messages]', err)
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}

/**
 * GET returns the onboarding prompt if the conversation is empty.
 * (Used by the client when it opens a brand-new conversation.)
 */
export async function GET(_: Request, { params }: Params) {
  const userId = await currentUserId()
  if (AUTH_ENABLED && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (AUTH_ENABLED) {
    const owned = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    })
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (owned.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const count = await prisma.message.count({ where: { conversationId: params.id } })
  if (count === 0) {
    return NextResponse.json({ onboarding: onboardingPrompt() })
  }
  return NextResponse.json({ onboarding: null })
}
