import { NextResponse } from 'next/server'
import { getFullGraph } from '@/lib/graph'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// NOTE: the psyche graph is currently global (not per-user). When auth
// is on we still gate read access behind a session, but every signed-in
// user sees the same graph. Per-user graph isolation will require
// adding userId to GraphNode/GraphEdge — a bigger change saved for later.
export async function GET() {
  try {
    if (AUTH_ENABLED) {
      const userId = await currentUserId()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    const graph = await getFullGraph()

    return NextResponse.json(graph)
  } catch (err) {
    console.error('[GET /api/graph]', err)
    return NextResponse.json({ error: 'Failed to fetch graph', detail: String(err) }, { status: 500 })
  }
}
