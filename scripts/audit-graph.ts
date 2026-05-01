/**
 * Audit (and optionally clean up) graph nodes that violate the tagging
 * invariants:
 *   1. label fails isRejectableLabel (gerund/pronoun/common-verb/etc.)
 *   2. zero edges (orphan)
 *   3. role-typed `son` or `daughter` (self-as-child reference)
 *
 * Default: dry-run. Lists candidates grouped by reason, prints counts.
 *   tsx -r dotenv/config scripts/audit-graph.ts
 *
 * To actually delete:
 *   tsx -r dotenv/config scripts/audit-graph.ts --apply
 *
 * Filter to one user:
 *   tsx -r dotenv/config scripts/audit-graph.ts --user <userId>
 *
 * Pick env explicitly (overrides default dotenv loading):
 *   DATABASE_URL=... tsx scripts/audit-graph.ts
 */
import { prisma } from '../src/lib/db'
import { isRejectableLabel } from '../src/lib/llm'
import { addToDenylist, ensureDenylistLoaded } from '../src/lib/labelDenylist'
import { displayLabel } from '../src/lib/utils'

type Candidate = {
  id: string
  label: string
  type: string
  userId: string | null
  reason: string
  edgeCount: number
  conversationRefs: number
}

const BOILERPLATE_PATTERNS: RegExp[] = [
  /Referenced across \d+ conversation/i,
  /Details will fill in as the user talks/i,
  /Nothing captured yet/i,
  /Come back after a few conversations/i,
]

function isBoilerplateContext(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false
  return BOILERPLATE_PATTERNS.some((re) => re.test(text))
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const scrubContext = args.includes('--scrub-context')
  const userIdx = args.indexOf('--user')
  const filterUserId = userIdx >= 0 ? args[userIdx + 1] : undefined

  await ensureDenylistLoaded()
  const where = filterUserId ? { userId: filterUserId } : {}

  if (scrubContext) {
    const all = await prisma.graphNode.findMany({
      where,
      select: { id: true, label: true, contextText: true },
    })
    const candidates = all.filter((n) => isBoilerplateContext(n.contextText))
    console.log(`\nFound ${candidates.length} nodes with boilerplate contextText:\n`)
    for (const c of candidates) {
      console.log(`  - ${c.label}: ${c.contextText?.slice(0, 80)}...`)
    }
    if (!apply) {
      console.log(`\nDry-run. Pass --scrub-context --apply to clear these.\n`)
      await prisma.$disconnect()
      return
    }
    for (const c of candidates) {
      await prisma.graphNode.update({
        where: { id: c.id },
        data: { contextText: null, contextUpdatedAt: null, contextSource: null },
      })
    }
    console.log(`\nCleared contextText on ${candidates.length} nodes.\n`)
    await prisma.$disconnect()
    return
  }

  const nodes = await prisma.graphNode.findMany({
    where,
    include: {
      _count: { select: { conversationRefs: true } },
    },
  })

  const allEdges = await prisma.graphEdge.findMany({
    where: filterUserId ? { userId: filterUserId } : {},
    select: { id: true, fromId: true, toId: true },
  })
  const edgeCountByNode = new Map<string, number>()
  for (const e of allEdges) {
    edgeCountByNode.set(e.fromId, (edgeCountByNode.get(e.fromId) ?? 0) + 1)
    edgeCountByNode.set(e.toId, (edgeCountByNode.get(e.toId) ?? 0) + 1)
  }

  const candidates: Candidate[] = []
  for (const node of nodes) {
    if (node.type === 'user') continue
    const edgeCount = edgeCountByNode.get(node.id) ?? 0
    const reasons: string[] = []
    // Domain nodes get a free pass on the shape predicate since their labels
    // (self/work/etc.) are short common nouns.
    if (node.type !== 'domain' && isRejectableLabel(node.label, node.type as any)) {
      reasons.push('label-shape')
    }
    if (node.type === 'role' && (node.label === 'son' || node.label === 'daughter')) {
      reasons.push('self-as-child')
    }
    if (edgeCount === 0 && node.type !== 'domain') {
      reasons.push('orphan')
    }
    if (reasons.length > 0) {
      candidates.push({
        id: node.id,
        label: node.label,
        type: node.type,
        userId: node.userId,
        reason: reasons.join('+'),
        edgeCount,
        conversationRefs: node._count.conversationRefs,
      })
    }
  }

  console.log(`\nScanned ${nodes.length} nodes${filterUserId ? ` for user ${filterUserId}` : ' (all users)'}.`)
  console.log(`Flagged ${candidates.length} candidates.\n`)

  const byReason = new Map<string, Candidate[]>()
  for (const c of candidates) {
    if (!byReason.has(c.reason)) byReason.set(c.reason, [])
    byReason.get(c.reason)!.push(c)
  }
  for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n[${reason}]  (${list.length})`)
    for (const c of list) {
      const userTag = c.userId ? c.userId.slice(0, 8) : 'null'
      console.log(`  - "${displayLabel(c.label)}" (${c.type})  user=${userTag}  edges=${c.edgeCount}  convRefs=${c.conversationRefs}`)
    }
  }

  if (!apply) {
    console.log(`\nDry-run. Pass --apply to delete these nodes (and their edges + conversation links).`)
    await prisma.$disconnect()
    return
  }

  console.log(`\nApplying deletions on ${candidates.length} nodes...`)
  let deleted = 0
  for (const c of candidates) {
    await prisma.graphEdge.deleteMany({ where: { OR: [{ fromId: c.id }, { toId: c.id }] } })
    await prisma.conversationNode.deleteMany({ where: { nodeId: c.id } })
    await prisma.messageNode.deleteMany({ where: { nodeId: c.id } })
    await prisma.graphNode.delete({ where: { id: c.id } }).catch((err) => {
      console.warn(`  failed to delete ${c.label} (${c.id}):`, err.message)
    })
    await addToDenylist(c.label, `audit:${c.reason}`)
    deleted++
  }
  console.log(`Deleted ${deleted} nodes.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
