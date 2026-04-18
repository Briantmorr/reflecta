import { prisma } from './db'
import { LLMResult, NodeType } from '@/types'
import { displayLabel, normalizeLabel } from './utils'

type PrismaErrorLike = { code?: string }

const VISIBLE_NODE_TYPES: NodeType[] = ['user', 'person', 'role', 'domain']
const CORE_TIER_ONE_DOMAINS = ['Self', 'Health', 'Work', 'Relationships', 'Hobbies', 'Lifestyle'] as const
const CORE_DOMAIN_QUESTIONS: Record<(typeof CORE_TIER_ONE_DOMAINS)[number], string> = {
  Self: 'Who am I?',
  Health: 'How am I doing?',
  Work: 'What do I do?',
  Relationships: 'Who am I connected to?',
  Hobbies: 'What do I enjoy?',
  Lifestyle: 'How do I live?',
}

async function ensureCoreDomainNodes(userNodeId: string) {
  const domainIds = new Map<string, string>()

  for (const label of CORE_TIER_ONE_DOMAINS) {
    const nodeId = await upsertNode(label, 'domain')
    domainIds.set(normalizeLabel(label), nodeId)
    await upsertRelationship(userNodeId, nodeId, 'has_domain')
  }

  return domainIds
}

export async function ensureUserNode(): Promise<string> {
  const existing = await prisma.graphNode.findUnique({ where: { label: 'user' } })
  if (existing) return existing.id

  const created = await prisma.graphNode.create({
    data: { label: 'user', type: 'user', mentionCount: 0 },
  })
  return created.id
}

export async function upsertNode(rawLabel: string, type: NodeType): Promise<string> {
  const canonicalLabel = canonicalGraphLabel(rawLabel)
  const normalized = normalizeLabel(canonicalLabel)
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

const GRAPH_LABEL_ALIASES: Record<string, string> = {
  helping: 'Service',
  'helping others': 'Service',
  proving: 'Desire For Approval',
  marriageminded: 'Marriage Minded Dating',
  'marriageminded dating': 'Marriage Minded Dating',
}

function canonicalGraphLabel(rawLabel: string) {
  return GRAPH_LABEL_ALIASES[normalizeLabel(rawLabel)] ?? rawLabel
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
    nodeIdsByLabel.set(normalizeLabel(canonicalGraphLabel(entity.name)), nodeId)
    taggedNodeIds.add(nodeId)
    await ensureSupportingStructure(entity.name, entity.type, nodeId, userNodeId, nodeIdsByLabel)
  }

  await ensurePersonRoleContainers(taggableEntities, nodeIdsByLabel)

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

    if (relationship.type === 'member_of') {
      const parentDomain = inferTierOneDomain(relationship.to, 'role')
      if (parentDomain) {
        const parentDomainId = nodeIdsByLabel.get(normalizeLabel(parentDomain))
        await removeRelationship(fromId, parentDomainId, 'part_of')
      }
    }
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
    const userNodeId = await ensureUserNode()
    await ensureCoreDomainNodes(userNodeId)

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
        return CORE_TIER_ONE_DOMAINS.map((label) => normalizeLabel(label)).includes(node.label)
      }
      return node._count.conversationRefs > 0
    })

    const finalNodeIds = new Set(finalNodes.map((node) => node.id))
    const graphUserNodeId = finalNodes.find((node) => node.label === 'user')?.id
    const finalEdges = visibleEdges.filter((edge) => {
      if (!finalNodeIds.has(edge.fromId) || !finalNodeIds.has(edge.toId)) return false

      if (!graphUserNodeId) return true
      if (edge.fromId !== graphUserNodeId && edge.toId !== graphUserNodeId) return true

      const otherNodeId = edge.fromId === graphUserNodeId ? edge.toId : edge.fromId
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
          node.type === 'user'
            ? 0
            : node.type === 'domain' && !domainNodeIds.has(node.id)
              ? 0
              : Math.max(node._count.conversationRefs, 1),
        createdAt: node.createdAt.toISOString(),
        dormant: node.type === 'domain' && !domainNodeIds.has(node.id),
        question:
          node.type === 'domain'
            ? CORE_DOMAIN_QUESTIONS[displayLabel(node.label) as keyof typeof CORE_DOMAIN_QUESTIONS]
            : undefined,
        insights: parseNodeInsights(node.insightSummary, node.insightBullets, node.insightGeneratedAt),
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
      console.error('[getFullGraph] Table not found (P2021) — DB may not be seeded:', error)
      return { nodes: [], edges: [] }
    }
    console.error('[getFullGraph] Unexpected error:', error)
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
    'self',
    'work',
    'relationships',
    'health',
    'hobbies',
    'lifestyle',
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
    'fatherhood',
    'parenthood',
    'responsibility',
    'clients',
    'friends',
    'software_engineering',
    'architecture',
    'ai',
    'philosophy',
    'hackathons',
    'community',
    'running',
    'writing',
    'reading',
    'music',
    'home',
    'routine',
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
  const canonicalLabel = canonicalGraphLabel(label)
  const normalized = normalizeLabel(canonicalLabel)
  if (type === 'domain' || normalized === 'user') return

  const domainLabel = inferTierOneDomain(canonicalLabel, type)
  if (!domainLabel) return

  const domainId = await getOrCreateNamedNode(domainLabel, 'domain', nodeIdsByLabel)
  await upsertRelationship(userNodeId, domainId, 'has_domain')

  if (type === 'role') {
    await upsertRelationship(nodeId, domainId, 'part_of')
    return
  }

  const roleLabel = inferRoleContainer(canonicalLabel)
  if (roleLabel) {
    const roleId = await getOrCreateNamedNode(roleLabel, 'role', nodeIdsByLabel)
    await upsertRelationship(roleId, domainId, 'part_of')
    await upsertRelationship(nodeId, roleId, 'member_of')
    return
  }

  await upsertRelationship(nodeId, domainId, 'part_of')
}

async function ensurePersonRoleContainers(
  entities: Array<{ name: string; type: NodeType }>,
  nodeIdsByLabel: Map<string, string>
) {
  const roleLabels = new Set(
    entities
      .filter((entity) => entity.type === 'role')
      .map((entity) => normalizeLabel(canonicalGraphLabel(entity.name)))
  )

  for (const person of entities.filter((entity) => entity.type === 'person')) {
    const normalized = normalizeLabel(person.name)
    if (isFamilyPerson(normalized)) continue

    const personId = nodeIdsByLabel.get(normalized)
    if (!personId) continue

    if (roleLabels.has('coworkers')) {
      const coworkersId = nodeIdsByLabel.get('coworkers')
      if (coworkersId) {
        await upsertRelationship(personId, coworkersId, 'member_of')
        await removeRelationship(personId, nodeIdsByLabel.get('relationships'), 'part_of')
        continue
      }
    }

    // Other person containers (Friends, Dating, etc.) require transcript-level
    // evidence and are inferred in src/lib/llm.ts. Do not guess here.
  }
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

async function removeRelationship(fromId: string, toId: string | undefined, relationship: string) {
  if (!toId) return
  await prisma.graphEdge.deleteMany({ where: { fromId, toId, relationship } })
}

function inferTierOneDomain(label: string, type: NodeType): (typeof CORE_TIER_ONE_DOMAINS)[number] | null {
  const normalized = normalizeLabel(label)

  if (normalized === 'self') return 'Self'
  if (normalized === 'relationships') return 'Relationships'
  if (normalized === 'work') return 'Work'
  if (normalized === 'health') return 'Health'
  if (normalized === 'hobbies') return 'Hobbies'
  if (normalized === 'lifestyle') return 'Lifestyle'

  const selfLabels = new Set([
    'self',
    'identity',
    'purpose',
    'values',
    'responsibility',
    'fatherhood',
    'parenthood',
    'confidence',
    'selfworth',
    'self_esteem',
    'growth',
    'mindset',
    'philosophy',
    'faith',
    'prayer',
    'church',
    'journaling',
    'childhood trauma',
    'worship',
    'proving',
    'support',
    'service',
    'desire for approval',
  ])
  if (selfLabels.has(normalized)) return 'Self'

  const relationshipLabels = new Set([
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
    'partner',
    'wife',
    'husband',
    'boyfriend',
    'girlfriend',
    'friend',
    'friends',
    'marriage',
    'marriage minded dating',
    'dating',
    'past relationship',
    'marriage readiness',
  ])
  if (relationshipLabels.has(normalized)) return 'Relationships'

  const lifestyleLabels = new Set([
    'lifestyle',
    'home',
    'house',
    'apartment',
    'routine',
    'routines',
    'habit',
    'habits',
    'sleep',
    'diet',
    'money',
    'finances',
    'schedule',
    'travel',
    'community',
    'neighbor',
    'neighbors',
    'group',
    'club',
    'volunteer',
    'class',
    'community',
    'home',
    'routine',
  ])
  if (lifestyleLabels.has(normalized)) return 'Lifestyle'

  const workLabels = new Set([
    'coworkers',
    'coworker',
    'boss',
    'manager',
    'team',
    'clients',
    'client',
    'software_engineering',
    'architecture',
    'ai',
    'hackathons',
    'writing',
    'writer',
    'job search',
    'northbridge consulting',
    'project management',
    'product management',
    'product',
  ])
  if (workLabels.has(normalized)) return 'Work'

  const hobbyLabels = new Set([
    'running',
    'reading',
    'music',
  ])
  if (hobbyLabels.has(normalized)) return 'Hobbies'

  if (type === 'person') return 'Relationships'

  if (type === 'role') {
    if (normalized.includes('cowork')) return 'Work'
    if (normalized.includes('client')) return 'Work'
    if (normalized.includes('parent')) return 'Relationships'
    if (normalized.includes('sibling')) return 'Relationships'
  }

  return null
}

function inferRoleContainer(label: string): string | null {
  const normalized = normalizeLabel(label)

  if (isFamilyPerson(normalized)) return null

  return null
}

function isFamilyPerson(normalizedLabel: string) {
  return new Set(['dad', 'mom', 'brother', 'sister', 'son', 'daughter']).has(normalizedLabel)
}

function parseNodeInsights(
  summary: string | null,
  bullets: string | null,
  generatedAt: Date | null
) {
  if (!summary || !generatedAt) return null

  let parsedBullets: string[] = []
  if (bullets) {
    try {
      const raw = JSON.parse(bullets) as unknown
      if (Array.isArray(raw)) {
        parsedBullets = raw.filter((value): value is string => typeof value === 'string')
      }
    } catch {
      parsedBullets = []
    }
  }

  return {
    summary,
    bullets: parsedBullets,
    generatedAt: generatedAt.toISOString(),
  }
}
