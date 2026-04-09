import { prisma } from './db'
import { LLMResult, NodeType } from '@/types'
import { normalizeLabel, displayLabel } from './utils'

/**
 * Ensure the singleton "User" node exists. Everyone's graph is centered on it.
 */
export async function ensureUserNode(): Promise<string> {
  const existing = await prisma.graphNode.findUnique({ where: { label: 'user' } })
  if (existing) return existing.id

  const created = await prisma.graphNode.create({
    data: { label: 'user', type: 'user', mentionCount: 0 },
  })
  return created.id
}

/**
 * Upsert a node by normalized label. If it exists, increment mentionCount.
 * Returns the node id.
 */
export async function upsertNode(rawLabel: string, type: NodeType): Promise<string> {
  const normalized = normalizeLabel(rawLabel)
  const existing = await prisma.graphNode.findUnique({ where: { label: normalized } })

  if (existing) {
    const updated = await prisma.graphNode.update({
      where: { id: existing.id },
      data: { mentionCount: { increment: 1 } },
    })
    return updated.id
  }

  const created = await prisma.graphNode.create({
    data: { label: normalized, type, mentionCount: 1 },
  })
  return created.id
}

/**
 * Apply an LLM extraction result to the graph. Returns the ids of all nodes
 * touched so we can link them to the message via MessageNode.
 */
export async function applyLLMResult(result: LLMResult, messageId: string): Promise<string[]> {
  const userNodeId = await ensureUserNode()
  const touchedNodeIds = new Set<string>([userNodeId])

  // Upsert every entity
  for (const entity of result.entities) {
    const id = await upsertNode(entity.name, entity.type)
    touchedNodeIds.add(id)
  }

  // Upsert every relationship
  for (const rel of result.relationships) {
    const fromId =
      rel.from === 'User' ? userNodeId : await upsertNode(rel.from, 'person')
    const toId = rel.to === 'User' ? userNodeId : await upsertNode(rel.to, inferTypeForTarget(rel.to))

    touchedNodeIds.add(fromId)
    touchedNodeIds.add(toId)

    // Upsert edge (unique on [from, to, relationship])
    await prisma.graphEdge.upsert({
      where: {
        fromId_toId_relationship: {
          fromId,
          toId,
          relationship: rel.type,
        },
      },
      create: { fromId, toId, relationship: rel.type },
      update: {},
    })
  }

  // Link all touched nodes to this message (so we get a "tag → messages" index for free)
  for (const nodeId of touchedNodeIds) {
    await prisma.messageNode.upsert({
      where: { messageId_nodeId: { messageId, nodeId } },
      create: { messageId, nodeId },
      update: {},
    })
  }

  return [...touchedNodeIds]
}

/**
 * Return the entire graph with display-ready labels.
 */
export async function getFullGraph() {
  const [nodes, edges] = await Promise.all([
    prisma.graphNode.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.graphEdge.findMany(),
  ])

  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      label: n.label === 'user' ? 'You' : displayLabel(n.label),
      type: n.type as NodeType,
      mentionCount: n.mentionCount,
      createdAt: n.createdAt.toISOString(),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      relationship: e.relationship,
    })),
  }
}

function inferTypeForTarget(label: string): NodeType {
  const domains = ['Family', 'Work', 'Relationships', 'Health', 'Hobbies']
  if (domains.includes(label)) return 'domain'
  const emotions = ['Stress', 'Sadness', 'Anger', 'Fear', 'Joy', 'Pride', 'Peace', 'Love']
  if (emotions.includes(label)) return 'emotion'
  return 'person'
}
