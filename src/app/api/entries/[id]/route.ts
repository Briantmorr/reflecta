import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getEntryTitle } from '@/lib/utils'

type Params = { params: { id: string } }

export async function GET(_: Request, { params }: Params) {
  try {
    const entry = await prisma.journalEntry.findUnique({
      where: { id: params.id },
      include: { questions: { orderBy: { createdAt: 'desc' } } },
    })
    if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(entry)
  } catch (err) {
    console.error('[GET /api/entries/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch entry' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { content } = await request.json()
    if (!content || typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }

    const title = getEntryTitle(content)
    const entry = await prisma.journalEntry.update({
      where: { id: params.id },
      data: { content, title },
      include: { questions: { orderBy: { createdAt: 'desc' } } },
    })
    return NextResponse.json(entry)
  } catch (err) {
    console.error('[PUT /api/entries/[id]]', err)
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 })
  }
}

export async function DELETE(_: Request, { params }: Params) {
  try {
    await prisma.journalEntry.delete({ where: { id: params.id } })
    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[DELETE /api/entries/[id]]', err)
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 })
  }
}
