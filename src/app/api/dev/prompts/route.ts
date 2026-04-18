import { NextResponse } from 'next/server'
import { getPromptFallbacks } from '@/lib/llm'
import { listPromptStates, remotePromptsEnabled } from '@/lib/promptStore'
import { getFirebaseAdminDb } from '@/lib/firebaseAdmin'
import { requirePromptEditor } from './auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authError = requirePromptEditor(request)
  if (authError) return authError

  try {
    const prompts = await listPromptStates(getPromptFallbacks())
    return NextResponse.json({
      remoteEnabled: remotePromptsEnabled(),
      firebaseConfigured: Boolean(getFirebaseAdminDb()),
      prompts,
    })
  } catch (error) {
    console.error('[GET /api/dev/prompts]', error)
    return NextResponse.json({ error: 'Failed to load prompts' }, { status: 500 })
  }
}
