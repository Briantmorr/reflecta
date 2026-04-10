import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'

export async function GET() {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversations = await prisma.conversation.findMany({
      where: AUTH_ENABLED ? { userId } : undefined,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        nodeTags: {
          include: { node: true },
          orderBy: { node: { label: 'asc' } },
        },
        _count: { select: { messages: true } },
      },
    })
    return NextResponse.json(
      conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
        tags: c.nodeTags
          .filter((tag) => tag.node.type !== 'emotion')
          .map((tag) => ({
            nodeId: tag.nodeId,
            label: tag.node.label === 'user' ? 'You' : tag.node.label.replace(/\b\w/g, (s) => s.toUpperCase()),
            type: tag.node.type,
          })),
      }))
    )
  } catch (err) {
    console.error('[GET /api/conversations]', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversation = await prisma.conversation.create({
      data: { title: null, userId },
    })
    return NextResponse.json(conversation, { status: 201 })
  } catch (err) {
    console.error('[POST /api/conversations]', err)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
