import { NextResponse } from 'next/server'
import { createPromptVersion, getPromptDefinition, PromptKey } from '@/lib/promptStore'
import { requirePromptEditor } from '../../auth'

type Params = { params: { key: string } }

export const dynamic = 'force-dynamic'

export async function POST(request: Request, { params }: Params) {
  const authError = requirePromptEditor(request)
  if (authError) return authError

  const definition = getPromptDefinition(params.key)
  if (!definition) {
    return NextResponse.json({ error: 'Unknown prompt key' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const version = await createPromptVersion({
      key: definition.key as PromptKey,
      content: String(body.content ?? ''),
      label: typeof body.label === 'string' ? body.label : undefined,
      createdBy: typeof body.createdBy === 'string' ? body.createdBy : undefined,
    })

    return NextResponse.json({ version })
  } catch (error) {
    console.error('[POST /api/dev/prompts/[key]/versions]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to save prompt version' },
      { status: 500 }
    )
  }
}
