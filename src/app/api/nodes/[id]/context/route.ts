import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { populateNodeContextForNode } from '@/lib/nodeContext'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const node = await prisma.graphNode.findUnique({
      where: { id },
      select: { id: true, contextText: true, contextUpdatedAt: true },
    })
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    return NextResponse.json({
      nodeId: node.id,
      context: node.contextText,
      updatedAt: node.contextUpdatedAt?.toISOString() ?? null,
    })
  } catch (err) {
    console.error('[GET /api/nodes/:id/context]', err)
    return NextResponse.json({ error: 'Failed to fetch node context' }, { status: 500 })
  }
}

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const node = await prisma.graphNode.findUnique({ where: { id } })
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    const updated = await populateNodeContextForNode({
      nodeId: node.id,
      userId: AUTH_ENABLED ? userId : null,
    })

    return NextResponse.json({
      nodeId: updated.nodeId,
      context: updated.context,
      updatedAt: updated.updatedAt,
      conversationCount: updated.conversationCount,
    })
  } catch (err) {
    console.error('[POST /api/nodes/:id/context]', err)
    return NextResponse.json({ error: 'Failed to generate node context' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { id } = await params
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { context?: unknown } | null
    const raw = typeof body?.context === 'string' ? body.context : null
    if (raw === null) {
      return NextResponse.json({ error: 'context is required' }, { status: 400 })
    }

    const trimmed = raw.trim()
    const node = await prisma.graphNode.findUnique({ where: { id } })
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }

    const updatedAt = new Date()
    const updated = await prisma.graphNode.update({
      where: { id: node.id },
      data: {
        contextText: trimmed.length > 0 ? trimmed : null,
        contextUpdatedAt: trimmed.length > 0 ? updatedAt : null,
      },
    })

    return NextResponse.json({
      nodeId: updated.id,
      context: updated.contextText,
      updatedAt: updated.contextUpdatedAt?.toISOString() ?? null,
    })
  } catch (err) {
    console.error('[PATCH /api/nodes/:id/context]', err)
    return NextResponse.json({ error: 'Failed to update node context' }, { status: 500 })
  }
}
