import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getFullGraph } from '@/lib/graph'
import { generateConversationTurnStream } from '@/lib/llm'
import { fetchRelevantNodeContexts } from '@/lib/relevantNodeContext'
import { deriveConversationTitle } from '@/lib/utils'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { Message } from '@/types'

type Params = { params: { id: string } }

/**
 * Post a user message. Flow:
 *  1. Persist user message
 *  2. Stream context-selection status + the conversation LLM turn
 *  3. Persist assistant response
 *  4. Stream final messages + current graph so the client can re-render
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { content, selectedNodeIds } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    const selectedNodeIdList = Array.isArray(selectedNodeIds)
      ? selectedNodeIds.filter((nodeId): nodeId is string => typeof nodeId === 'string')
      : []

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { nodeRefs: { select: { nodeId: true } } },
        },
        nodeTags: {
          select: { nodeId: true },
        },
      },
    })
    if (!conversation) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (AUTH_ENABLED && conversation.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          const send = (event: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          }

          try {
            // 1. Persist user message
            const userMessage = await prisma.message.create({
              data: { conversationId: params.id, role: 'user', content },
            })

            send({ type: 'status', status: 'reading_context' })

            // 2. LLM turn with conversation + graph + selected node memory context
            const currentGraph = await getFullGraph({ userId })
            const conversationMessages: Message[] = conversation.messages.map((message) => ({
              id: message.id,
              conversationId: message.conversationId,
              role: message.role as Message['role'],
              content: message.content,
              createdAt: message.createdAt.toISOString(),
              nodeRefs: message.nodeRefs,
            }))
            const relevantNodeContexts = fetchRelevantNodeContexts({
              graph: currentGraph,
              userMessage: content,
              conversationMessages,
              selectedNodeIds: selectedNodeIdList,
              conversationTagNodeIds: conversation.nodeTags.map((tag) => tag.nodeId),
            })

            send({
              type: 'context_nodes',
              nodes: relevantNodeContexts.map((context) => ({
                nodeId: context.nodeId,
                label: context.label,
                reason: context.reason,
              })),
            })

            const llmResult = await generateConversationTurnStream({
              userMessage: content,
              conversationMessages,
              graph: currentGraph,
              relevantNodeContexts,
              onDelta: (delta) => send({ type: 'delta', text: delta }),
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
              await prisma.conversation.update({
                where: { id: params.id },
                data: { updatedAt: new Date() },
              })
            }

            const graph = await getFullGraph({ userId })

            send({
              type: 'final',
              userMessage,
              assistantMessage,
              graph,
              touchedNodeIds: [],
            })
          } catch (err) {
            console.error('[POST /api/conversations/[id]/messages:stream]', err)
            send({ type: 'error', error: 'Failed to process message' })
          } finally {
            controller.close()
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      }
    )
  } catch (err) {
    console.error('[POST /api/conversations/[id]/messages]', err)
    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 })
  }
}
