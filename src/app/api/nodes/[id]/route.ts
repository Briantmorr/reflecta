import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { displayLabel, normalizeLabel } from '@/lib/utils'

type RouteContext = { params: { id: string } }

const PROTECTED_LABELS = new Set([
  'user',
  'self',
  'health',
  'work',
  'relationships',
  'hobbies',
  'lifestyle',
])

function ownerWhere(userId: string | null) {
  return AUTH_ENABLED ? { userId } : { userId: null }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as { label?: unknown } | null
    const rawLabel = typeof body?.label === 'string' ? body.label : ''
    const normalizedLabel = normalizeLabel(rawLabel)

    if (!normalizedLabel) {
      return NextResponse.json({ error: 'Node name is required' }, { status: 400 })
    }

    const node = await prisma.graphNode.findFirst({
      where: { id: params.id, ...ownerWhere(userId) },
      select: { id: true, label: true, type: true },
    })
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }
    if (PROTECTED_LABELS.has(node.label)) {
      return NextResponse.json({ error: 'This node cannot be renamed' }, { status: 400 })
    }

    const existing = await prisma.graphNode.findFirst({
      where: {
        label: normalizedLabel,
        ...ownerWhere(userId),
        NOT: { id: node.id },
      },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json({ error: 'A node with that name already exists' }, { status: 409 })
    }

    const updated = await prisma.graphNode.update({
      where: { id: node.id },
      data: { label: normalizedLabel },
    })

    return NextResponse.json({
      nodeId: updated.id,
      label: displayLabel(updated.label),
      type: updated.type,
    })
  } catch (err) {
    console.error('[PATCH /api/nodes/:id]', err)
    return NextResponse.json({ error: 'Failed to rename node' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const node = await prisma.graphNode.findFirst({
      where: { id: params.id, ...ownerWhere(userId) },
      select: { id: true, label: true, type: true },
    })
    if (!node) {
      return NextResponse.json({ error: 'Node not found' }, { status: 404 })
    }
    if (PROTECTED_LABELS.has(node.label)) {
      return NextResponse.json({ error: 'This node cannot be deleted' }, { status: 400 })
    }

    const childCount = await prisma.graphEdge.count({
      where: {
        toId: node.id,
        ...ownerWhere(userId),
        fromNode: {
          type: { not: 'user' },
        },
      },
    })
    if (childCount > 0) {
      return NextResponse.json(
        { error: 'Delete child nodes first', childCount },
        { status: 409 }
      )
    }

    await prisma.graphNode.delete({ where: { id: node.id } })

    return NextResponse.json({
      nodeId: node.id,
      deleted: true,
    })
  } catch (err) {
    console.error('[DELETE /api/nodes/:id]', err)
    return NextResponse.json({ error: 'Failed to delete node' }, { status: 500 })
  }
}
