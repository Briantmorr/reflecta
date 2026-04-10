import { prisma } from './db'
import { LLMResult, NodeType } from '@/types'
import { displayLabel, normalizeLabel } from './utils'

type PrismaErrorLike = { code?: string }

const VISIBLE_NODE_TYPES: NodeType[] = ['user', 'person', 'role', 'domain']
const CORE_TIER_ONE_DOMAINS = ['Family', 'Relationships', 'Work', 'Health', 'Hobbies'] as const

export async function ensureUserNode(): Promise<string> {
  const existing = await prisma.graphNode.findUnique({ where: { label: 'user' } })
  if (existing) return existing.id

  const created = await prisma.graphNode.create({
    data: { label: 'user', type: 'user', mentionCount: 0 },
  })
  return created.id
}

export async function upsertNode(rawLabel: string, type: NodeType): Promise<string> {
  const normalized = normalizeLabel(rawLabel)
  const existing = await prisma.graphNode.findUnique({ where: { label: normalized } })

  if (existing) {
    if (existing.type === type) return existing.id
    const updated = await prisma.graphNode.update({
      where: { id: existing.id },
      data: { type },
    })
    return updated.id
  }

  const created = await prisma.graphNode.create({
    data: { label: normalized, type, mentionCount: 0 },
  })
  return created.id
}

export async function applyConversationMap(
  result: LLMResult,
  conversationId: string
): Promise<string[]> {
  const userNodeId = await ensureUserNode()
  const taggableEntities = dedupeEntities(
    result.entities.filter((entity) => entity.type !== 'emotion' && entity.type !== 'user')
  )

  const nodeIdsByLabel = new Map<string, string>([['user', userNodeId]])
  const taggedNodeIds = new Set<string>()

  for (const entity of taggableEntities) {
    const nodeId = await upsertNode(entity.name, entity.type)
    nodeIdsByLabel.set(normalizeLabel(entity.name), nodeId)
    taggedNodeIds.add(nodeId)
    await ensureSupportingStructure(entity.name, entity.type, nodeId, userNodeId, nodeIdsByLabel)
  }

  if (taggedNodeIds.size === 0) {
    const fallback = await createFallbackConversationTag(conversationId)
    taggedNodeIds.add(fallback)
  }

  for (const relationship of result.relationships) {
    const fromId = await getOrCreateRelationshipNode(nodeIdsByLabel, relationship.from)
    const toId = await getOrCreateRelationshipNode(nodeIdsByLabel, relationship.to)

    if (!fromId || !toId || fromId === toId) continue

    await prisma.graphEdge.upsert({
      where: {
        fromId_toId_relationship: {
          fromId,
          toId,
          relationship: relationship.type,
        },
      },
      create: { fromId, toId, relationship: relationship.type },
      update: {},
    })
  }

  await prisma.conversationNode.deleteMany({ where: { conversationId } })
  await prisma.conversationNode.createMany({
    data: [...taggedNodeIds].map((nodeId) => ({ conversationId, nodeId })),
  })

  return [...taggedNodeIds]
}

export async function removeConversationTag(conversationId: string, nodeId: string) {
  await prisma.conversationNode.delete({
    where: { conversationId_nodeId: { conversationId, nodeId } },
  })
}

export async function getConversationTags(conversationId: string) {
  const tags = await prisma.conversationNode.findMany({
    where: { conversationId },
    include: { node: true },
    orderBy: [{ node: { type: 'asc' } }, { node: { label: 'asc' } }],
  })

  return tags
    .filter((tag) => tag.node.type !== 'emotion')
    .map((tag) => ({
      nodeId: tag.nodeId,
      label: displayLabel(tag.node.label),
      type: tag.node.type as NodeType,
    }))
}

export async function getFullGraph() {
  try {
    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({
        include: {
          _count: { select: { conversationRefs: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.graphEdge.findMany(),
    ])

    const visibleNodes = nodes.filter((node) => node.type !== 'emotion') as Array<
      typeof nodes[number]
    >
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))

    const visibleEdges = edges.filter(
      (edge) => visibleNodeIds.has(edge.fromId) && visibleNodeIds.has(edge.toId)
    )

    const domainNodeIds = new Set(
      visibleNodes
        .filter((node) => node.type === 'domain')
        .map((node) => node.id)
        .filter((domainId) =>
          visibleEdges.some((edge) => {
            const isConnected =
              (edge.fromId === domainId && edge.toId !== domainId) ||
              (edge.toId === domainId && edge.fromId !== domainId)
            if (!isConnected) return false
            const otherId = edge.fromId === domainId ? edge.toId : edge.fromId
            const other = visibleNodes.find((node) => node.id === otherId)
            return !!other && other.type !== 'user' && other.type !== 'domain'
          })
        )
    )

    const finalNodes = visibleNodes.filter((node) => {
      if (node.label === 'user') return true
      if (!VISIBLE_NODE_TYPES.includes(node.type as NodeType)) return false
      if (node.type === 'domain') {
        return (
          CORE_TIER_ONE_DOMAINS.map((label) => normalizeLabel(label)).includes(node.label) &&
          domainNodeIds.has(node.id)
        )
      }
      return node._count.conversationRefs > 0
    })

    const finalNodeIds = new Set(finalNodes.map((node) => node.id))
    const userNodeId = finalNodes.find((node) => node.label === 'user')?.id
    const finalEdges = visibleEdges.filter((edge) => {
      if (!finalNodeIds.has(edge.fromId) || !finalNodeIds.has(edge.toId)) return false

      if (!userNodeId) return true
      if (edge.fromId !== userNodeId && edge.toId !== userNodeId) return true

      const otherNodeId = edge.fromId === userNodeId ? edge.toId : edge.fromId
      const otherNode = finalNodes.find((node) => node.id === otherNodeId)
      if (!otherNode) return false

      // Keep the center node visually clean: only first-ring containers connect to "You".
      return otherNode.type === 'domain' || otherNode.type === 'role'
    })

    return {
      nodes: finalNodes.map((node) => ({
        id: node.id,
        label: node.label === 'user' ? 'You' : displayLabel(node.label),
        type: node.type as NodeType,
        mentionCount:
          node.type === 'user' ? 0 : Math.max(node._count.conversationRefs, 1),
        createdAt: node.createdAt.toISOString(),
      })),
      edges: finalEdges.map((edge) => ({
        id: edge.id,
        fromId: edge.fromId,
        toId: edge.toId,
        relationship: edge.relationship,
      })),
    }
  } catch (error) {
    if ((error as PrismaErrorLike)?.code === 'P2021') {
      return { nodes: [], edges: [] }
    }
    throw error
  }
}

async function getOrCreateRelationshipNode(
  nodeIdsByLabel: Map<string, string>,
  rawLabel: string
): Promise<string | null> {
  const normalized = normalizeLabel(rawLabel)
  if (normalized === 'user') return nodeIdsByLabel.get('user') ?? null

  if (nodeIdsByLabel.has(normalized)) {
    return nodeIdsByLabel.get(normalized) ?? null
  }

  const inferredType = inferTypeForTarget(rawLabel)
  if (inferredType === 'emotion') return null

  const nodeId = await upsertNode(rawLabel, inferredType)
  nodeIdsByLabel.set(normalized, nodeId)
  return nodeId
}

async function createFallbackConversationTag(conversationId: string): Promise<string> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  })

  const fallbackLabel = conversation?.title?.trim() || 'Life'
  return upsertNode(fallbackLabel, inferTypeForTarget(fallbackLabel))
}

function dedupeEntities(result: LLMResult['entities']) {
  const seen = new Set<string>()
  return result.filter((entity) => {
    const key = `${normalizeLabel(entity.name)}:${entity.type}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function inferTypeForTarget(label: string): NodeType {
  const normalized = normalizeLabel(label)
  if (normalized === 'user') return 'user'

  const domains = new Set([
    'family',
    'work',
    'relationships',
    'health',
    'hobbies',
    'friends',
    'community',
  ])
  if (domains.has(normalized)) return 'domain'

  const roles = new Set([
    'coworkers',
    'coworker',
    'team',
    'manager',
    'boss',
    'parents',
    'siblings',
    'partner',
    'clients',
  ])
  if (roles.has(normalized)) return 'role'

  const emotions = new Set([
    'stress',
    'sadness',
    'anger',
    'fear',
    'joy',
    'pride',
    'peace',
    'love',
  ])
  if (emotions.has(normalized)) return 'emotion'

  return 'person'
}

async function ensureSupportingStructure(
  label: string,
  type: NodeType,
  nodeId: string,
  userNodeId: string,
  nodeIdsByLabel: Map<string, string>
) {
  const normalized = normalizeLabel(label)
  if (type === 'domain' || normalized === 'user') return

  const domainLabel = inferTierOneDomain(label, type)
  if (!domainLabel) return

  const domainId = await getOrCreateNamedNode(domainLabel, 'domain', nodeIdsByLabel)
  await upsertRelationship(userNodeId, domainId, 'has_domain')

  if (type === 'role') {
    await upsertRelationship(nodeId, domainId, 'part_of')
    return
  }

  const roleLabel = inferRoleContainer(label)
  if (roleLabel) {
    const roleId = await getOrCreateNamedNode(roleLabel, 'role', nodeIdsByLabel)
    await upsertRelationship(roleId, domainId, 'part_of')
    await upsertRelationship(nodeId, roleId, 'member_of')
    return
  }

  await upsertRelationship(nodeId, domainId, 'part_of')
}

async function getOrCreateNamedNode(
  label: string,
  type: NodeType,
  nodeIdsByLabel: Map<string, string>
) {
  const normalized = normalizeLabel(label)
  const existing = nodeIdsByLabel.get(normalized)
  if (existing) return existing

  const nodeId = await upsertNode(label, type)
  nodeIdsByLabel.set(normalized, nodeId)
  return nodeId
}

async function upsertRelationship(fromId: string, toId: string, relationship: string) {
  if (fromId === toId) return

  await prisma.graphEdge.upsert({
    where: {
      fromId_toId_relationship: {
        fromId,
        toId,
        relationship,
      },
    },
    create: { fromId, toId, relationship },
    update: {},
  })
}

function inferTierOneDomain(label: string, type: NodeType): (typeof CORE_TIER_ONE_DOMAINS)[number] | null {
  const normalized = normalizeLabel(label)

  if (normalized === 'family') return 'Family'
  if (normalized === 'relationships') return 'Relationships'
  if (normalized === 'work') return 'Work'
  if (normalized === 'health') return 'Health'
  if (normalized === 'hobbies') return 'Hobbies'

  const familyLabels = new Set([
    'dad',
    'mom',
    'father',
    'mother',
    'brother',
    'sister',
    'son',
    'daughter',
    'parents',
    'siblings',
  ])
  if (familyLabels.has(normalized)) return 'Family'

  const relationshipLabels = new Set([
    'partner',
    'wife',
    'husband',
    'boyfriend',
    'girlfriend',
    'friend',
    'friends',
  ])
  if (relationshipLabels.has(normalized)) return 'Relationships'

  const workLabels = new Set([
    'coworkers',
    'coworker',
    'boss',
    'manager',
    'team',
    'clients',
    'client',
  ])
  if (workLabels.has(normalized)) return 'Work'

  if (type === 'role') {
    if (normalized.includes('cowork')) return 'Work'
    if (normalized.includes('client')) return 'Work'
  }

  return null
}

function inferRoleContainer(label: string): string | null {
  const normalized = normalizeLabel(label)

  const familyPeople = new Set(['dad', 'mom', 'brother', 'sister', 'son', 'daughter'])
  if (familyPeople.has(normalized)) return null

  return null
}
