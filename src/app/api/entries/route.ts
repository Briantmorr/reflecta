import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEntryTitle } from '@/lib/utils'

export async function GET() {
  try {
    const entries = await prisma.journalEntry.findMany({
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(entries)
  } catch (err) {
    console.error('[GET /api/entries]', err)
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { content } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const title = getEntryTitle(content)
    const entry = await prisma.journalEntry.create({
      data: { content, title },
      include: { questions: { orderBy: { createdAt: 'desc' } } },
    })
    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('[POST /api/entries]', err)
    return NextResponse.json({ error: 'Failed to create entry' }, { status: 500 })
  }
}
