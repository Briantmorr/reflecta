import { NextResponse } from 'next/server'
import { getFullGraph } from '@/lib/graph'

export async function GET() {
  try {
    const graph = await getFullGraph()
    return NextResponse.json(graph)
  } catch (err) {
    console.error('[GET /api/graph]', err)
    return NextResponse.json({ error: 'Failed to fetch graph' }, { status: 500 })
  }
}
