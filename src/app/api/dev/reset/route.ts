import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { AUTH_ENABLED, currentUserId } from '@/lib/auth'
import { getFullGraph } from '@/lib/graph'

function resetAllowed() {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEV_RESET === 'true'
}

function ownerWhere(userId: string | null) {
  return AUTH_ENABLED ? { userId } : { userId: null }
}

export async function POST() {
  try {
    if (!resetAllowed()) {
      return NextResponse.json({ error: 'Dev reset is disabled' }, { status: 403 })
    }

    const userId = await currentUserId()
    if (AUTH_ENABLED && !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const where = ownerWhere(userId)

    await prisma.$transaction(async (tx) => {
      await tx.conversation.deleteMany({ where })
      await tx.graphEdge.deleteMany({ where })
      await tx.graphNode.deleteMany({ where })
    })

    const graph = await getFullGraph({ userId })

    return NextResponse.json({
      reset: true,
      graph,
    })
  } catch (err) {
    console.error('[POST /api/dev/reset]', err)
    return NextResponse.json({ error: 'Failed to reset app data' }, { status: 500 })
  }
}
