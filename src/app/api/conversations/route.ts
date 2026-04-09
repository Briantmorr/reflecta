import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
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
      }))
    )
  } catch (err) {
    console.error('[GET /api/conversations]', err)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const conversation = await prisma.conversation.create({
      data: { title: null },
    })
    return NextResponse.json(conversation, { status: 201 })
  } catch (err) {
    console.error('[POST /api/conversations]', err)
    return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
  }
}
