import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { generateReflectiveQuestions } from '@/lib/anthropic'

export async function POST(request: Request) {
  try {
    const { entryId } = await request.json()
    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required' }, { status: 400 })
    }

    const entry = await prisma.journalEntry.findUnique({ where: { id: entryId } })
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured', questions: [] },
        { status: 503 }
      )
    }

    const questionTexts = await generateReflectiveQuestions(entry.content)

    // Replace any existing questions for this entry
    await prisma.question.deleteMany({ where: { entryId } })
    const questions = await prisma.$transaction(
      questionTexts.map((text) =>
        prisma.question.create({ data: { text, entryId } })
      )
    )

    return NextResponse.json({ questions })
  } catch (err) {
    console.error('[POST /api/insights]', err)
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 })
  }
}
