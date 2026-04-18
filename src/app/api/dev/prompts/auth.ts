import { NextResponse } from 'next/server'
import { promptEditorAuthorized, promptEditorEnabled } from '@/lib/promptStore'

export function requirePromptEditor(request: Request) {
  if (!promptEditorEnabled()) {
    return NextResponse.json({ error: 'Prompt editor disabled' }, { status: 404 })
  }

  const secret = request.headers.get('x-prompt-editor-secret')
  if (!promptEditorAuthorized(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
