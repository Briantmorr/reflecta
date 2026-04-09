import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Params = { params: { id: string } }

export async function GET(_: Request, { params }: Params) {
  try {
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
    return NextResponse.json(conversation)
  } catch (err) {
    console.error('[GET /api/conversations/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    await prisma.conversation.delete({ where: { id: params.id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/conversations/[id]]', err)
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 })
  }
}
