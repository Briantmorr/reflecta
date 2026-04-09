import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { mockLLMCall, onboardingPrompt } from '@/lib/mockLLM'
import { applyLLMResult, getFullGraph } from '@/lib/graph'
import { deriveConversationTitle } from '@/lib/utils'

type Params = { params: { id: string } }

/**
 * Post a user message. Flow:
 *  1. Persist user message
 *  2. Run (mock) LLM → extract entities + relationships
 *  3. Update graph + tag user message with touched nodes
 *  4. Persist assistant response, also tagged with touched nodes
 *  5. Return both messages + the updated graph so the client can re-render
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { content } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: { _count: { select: { messages: true } } },
    })
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // 1. Persist user message
    const userMessage = await prisma.message.create({
      data: { conversationId: params.id, role: 'user', content },
    })

    // 2. Mock LLM
    const llmResult = mockLLMCall(content)

    // 3. Update graph + tag user message
    const touchedNodeIds = await applyLLMResult(llmResult, userMessage.id)

    // 4. Persist assistant message, tagged with the same nodes
    const assistantMessage = await prisma.message.create({
      data: { conversationId: params.id, role: 'assistant', content: llmResult.response },
    })
    if (touchedNodeIds.length > 0) {
      await prisma.messageNode.createMany({
        data: touchedNodeIds.map((nodeId) => ({ messageId: assistantMessage.id, nodeId })),
      })
    }

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
      touchedNodeIds,
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
  const count = await prisma.message.count({ where: { conversationId: params.id } })
  if (count === 0) {
    return NextResponse.json({ onboarding: onboardingPrompt() })
  }
  return NextResponse.json({ onboarding: null })
}
