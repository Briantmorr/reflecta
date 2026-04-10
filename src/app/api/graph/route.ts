import { NextResponse } from 'next/server'
import { getFullGraph } from '@/lib/graph'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'

// NOTE: the psyche graph is currently global (not per-user). When auth
// is on we still gate read access behind a session, but every signed-in
// user sees the same graph. Per-user graph isolation will require
// adding userId to GraphNode/GraphEdge — a bigger change saved for later.
export async function GET(request: Request) {
  try {
    if (AUTH_ENABLED) {
      const userId = await currentUserId()
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }
    const graph = await getFullGraph()

    // Debug mode: append diagnostics when ?debug is present
    const url = new URL(request.url)
    if (url.searchParams.has('debug')) {
      const fs = await import('node:fs')
      const path = await import('node:path')
      return NextResponse.json({
        ...graph,
        _debug: {
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          tmpDbExists: fs.existsSync('/tmp/dev.db'),
          tmpDbSize: fs.existsSync('/tmp/dev.db') ? fs.statSync('/tmp/dev.db').size : null,
          prismaDbExists: fs.existsSync(path.join(process.cwd(), 'prisma', 'dev.db')),
          prismaDbSize: fs.existsSync(path.join(process.cwd(), 'prisma', 'dev.db'))
            ? fs.statSync(path.join(process.cwd(), 'prisma', 'dev.db')).size : null,
        },
      })
    }

    return NextResponse.json(graph)
  } catch (err) {
    console.error('[GET /api/graph]', err)
    return NextResponse.json({ error: 'Failed to fetch graph', detail: String(err) }, { status: 500 })
  }
}
