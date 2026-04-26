import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'

type Params = { params: { id: string } }

export async function GET(_: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: params.id },
      include: {
        nodeTags: {
          include: { node: true },
          orderBy: { node: { label: 'asc' } },
        },
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
    return NextResponse.json({
      ...conversation,
      tags: conversation.nodeTags
        .filter((tag) => tag.node.type !== 'emotion')
        .map((tag) => ({
          nodeId: tag.nodeId,
          label: tag.node.label === 'user' ? 'You' : tag.node.label.replace(/\b\w/g, (s) => s.toUpperCase()),
          type: tag.node.type,
        })),
    })
  } catch (err) {
    console.error('[GET /api/conversations/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const existing = await prisma.conversation.findUnique({
      where: { id: params.id },
      select: { userId: true },
    })

    if (!existing) {
      return new NextResponse(null, { status: 204 })
    }

    if (AUTH_ENABLED && existing.userId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.conversation.delete({ where: { id: params.id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/conversations/[id]]', err)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
