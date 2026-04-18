import { NextResponse } from 'next/server'
import { activatePromptVersion, getPromptDefinition, PromptKey } from '@/lib/promptStore'
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
    const versionId = String(body.versionId ?? '')
    if (!versionId) {
      return NextResponse.json({ error: 'versionId is required' }, { status: 400 })
    }

    await activatePromptVersion(
      definition.key as PromptKey,
      versionId,
      typeof body.updatedBy === 'string' ? body.updatedBy : undefined
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[POST /api/dev/prompts/[key]/activate]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to activate prompt version' },
      { status: 500 }
    )
  }
}
