import { prisma } from './db'
import { LLMResult, NodeType } from '@/types'
import { displayLabel, normalizeLabel } from './utils'
import { isRejectableLabel } from './llm'
import { addToDenylist, ensureDenylistLoaded } from './labelDenylist'

type PrismaErrorLike = { code?: string }
type GraphOwner = { userId?: string | null }

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

function ownerWhere(userId?: string | null) {
  return userId ? { userId } : { userId: null }
}

async function ensureCoreDomainNodes(userNodeId: string, userId?: string | null) {
  const domainIds = new Map<string, string>()

  for (const label of CORE_TIER_ONE_DOMAINS) {
    const nodeId = await upsertNode(label, 'domain', { userId })
    domainIds.set(normalizeLabel(label), nodeId)
    await upsertRelationship(userNodeId, nodeId, 'has_domain', { userId })
  }

  return domainIds
}

export async function ensureUserNode({ userId }: GraphOwner = {}): Promise<string> {
  const existing = await prisma.graphNode.findFirst({ where: { ...ownerWhere(userId), label: 'user' } })
  if (existing) return existing.id

  const created = await prisma.graphNode.create({
    data: { label: 'user', type: 'user', mentionCount: 0, userId: userId ?? null },
  })
  return created.id
}

export async function upsertNode(rawLabel: string, type: NodeType, { userId }: GraphOwner = {}): Promise<string> {
  const canonicalLabel = canonicalGraphLabel(rawLabel)
  const normalized = normalizeLabel(canonicalLabel)
  const existing = await prisma.graphNode.findFirst({ where: { ...ownerWhere(userId), label: normalized } })

  if (existing) {
    if (existing.type === type) return existing.id
    const updated = await prisma.graphNode.update({
      where: { id: existing.id },
      data: { type },
    })
    return updated.id
  }

  const created = await prisma.graphNode.create({
    data: { label: normalized, type, mentionCount: 0, userId: userId ?? null },
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
  conversationId: string,
  { userId }: GraphOwner = {}
): Promise<string[]> {
  await ensureDenylistLoaded()
  const userNodeId = await ensureUserNode({ userId })
  const taggableEntities = dedupeEntities(
    result.entities
      .filter((entity) => entity.type !== 'emotion' && entity.type !== 'user')
      // Fix A (defensive): never trust upstream sanitization alone. Re-apply the
      // shape predicate here so this is a single source of truth for what enters
      // the graph.
      .filter((entity) => entity.type === 'domain' || !isRejectableLabel(normalizeLabel(entity.name), entity.type))
  )

  const nodeIdsByLabel = new Map<string, string>([['user', userNodeId]])
  const taggedNodeIds = new Set<string>()
  const createdNodeIds = new Set<string>()

  // Entities the LLM/heuristics already placed via the relationships array.
  // For these, ensureSupportingStructure should still create parent containers
  // (Family, Coworkers, etc.) but skip the entity's own placement edge so we
  // don't end up with multiple parents.
  const placementEdgeTypes = new Set(['part_of', 'member_of', 'has_domain'])
  const placedByRelationships = new Set<string>()
  for (const rel of result.relationships) {
    if (placementEdgeTypes.has(rel.type)) placedByRelationships.add(normalizeLabel(rel.from))
  }

  for (const entity of taggableEntities) {
    const nodeId = await upsertNodeTracked(entity.name, entity.type, { userId }, createdNodeIds)
    nodeIdsByLabel.set(normalizeLabel(entity.name), nodeId)
    nodeIdsByLabel.set(normalizeLabel(canonicalGraphLabel(entity.name)), nodeId)
    taggedNodeIds.add(nodeId)
    const skipOwnPlacement = placedByRelationships.has(normalizeLabel(entity.name)) ||
      placedByRelationships.has(normalizeLabel(canonicalGraphLabel(entity.name)))
    await ensureSupportingStructure(entity.name, entity.type, nodeId, userNodeId, nodeIdsByLabel, { userId }, createdNodeIds, skipOwnPlacement)
  }

  await ensurePersonRoleContainers(taggableEntities, nodeIdsByLabel, { userId })

  if (taggedNodeIds.size === 0) {
    const fallback = await createFallbackConversationTag(conversationId, { userId })
    taggedNodeIds.add(fallback)
  }

  for (const relationship of result.relationships) {
    const fromId = await getOrCreateRelationshipNode(nodeIdsByLabel, relationship.from, { userId }, createdNodeIds)
    const toId = await getOrCreateRelationshipNode(nodeIdsByLabel, relationship.to, { userId }, createdNodeIds)

    if (!fromId || !toId || fromId === toId) continue

    const existingEdge = await prisma.graphEdge.findFirst({
      where: { ...ownerWhere(userId), fromId, toId, relationship: relationship.type },
      select: { id: true },
    })
    if (!existingEdge) {
      await prisma.graphEdge.create({
        data: { fromId, toId, relationship: relationship.type, userId: userId ?? null },
      })
    }

    if (relationship.type === 'member_of') {
        const parentDomain = inferTierOneDomain(relationship.to, 'role')
      if (parentDomain) {
        const parentDomainId = nodeIdsByLabel.get(normalizeLabel(parentDomain))
        await removeRelationship(fromId, parentDomainId, 'part_of', { userId })
      }
    }
  }

  // Fix C: orphan cleanup. Any node we just created that ended up with zero
  // edges (no placement, no LLM relationship, no person-container) violates the
  // "every node connects to You" invariant. Drop it and unhook the tag. Only
  // delete nodes we created in this pass — never touch pre-existing graph data.
  for (const nodeId of [...createdNodeIds]) {
    if (nodeId === userNodeId) continue
    const edgeCount = await prisma.graphEdge.count({
      where: { ...ownerWhere(userId), OR: [{ fromId: nodeId }, { toId: nodeId }] },
    })
    if (edgeCount > 0) continue
    const node = await prisma.graphNode.findUnique({ where: { id: nodeId }, select: { label: true, type: true } })
    console.warn('[applyConversationMap] dropped orphan node:', node?.label, node?.type)
    taggedNodeIds.delete(nodeId)
    createdNodeIds.delete(nodeId)
    await prisma.graphNode.delete({ where: { id: nodeId } }).catch(() => {})
    if (node?.label) await addToDenylist(node.label, 'orphan-cleanup')
  }

  if (taggedNodeIds.size === 0) {
    const fallback = await createFallbackConversationTag(conversationId, { userId })
    taggedNodeIds.add(fallback)
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

export async function getFullGraph({ userId }: GraphOwner = {}) {
  try {
    const userNodeId = await ensureUserNode({ userId })
    await ensureCoreDomainNodes(userNodeId, userId)

    const [nodes, edges] = await Promise.all([
      prisma.graphNode.findMany({
        where: ownerWhere(userId),
        include: {
          _count: { select: { conversationRefs: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.graphEdge.findMany({ where: ownerWhere(userId) }),
    ])

    const visibleNodes = nodes.filter((node) => node.type !== 'emotion') as Array<
      typeof nodes[number]
    >
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))

    const visibleEdges = edges.filter(
      (edge) => visibleNodeIds.has(edge.fromId) && visibleNodeIds.has(edge.toId)
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
    const finalNodeById = new Map(finalNodes.map((node) => [node.id, node]))
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
    const activeDomainNodeIds = new Set(
      finalNodes
        .filter((node) => node.type === 'domain')
        .map((node) => node.id)
        .filter((domainId) =>
          finalEdges.some((edge) => {
            const isConnected =
              (edge.fromId === domainId && edge.toId !== domainId) ||
              (edge.toId === domainId && edge.fromId !== domainId)
            if (!isConnected) return false
            const otherId = edge.fromId === domainId ? edge.toId : edge.fromId
            const other = finalNodeById.get(otherId)
            return !!other && other.type !== 'user' && other.type !== 'domain'
          })
        )
    )

    return {
      nodes: finalNodes.map((node) => ({
        id: node.id,
        label: node.label === 'user' ? 'You' : displayLabel(node.label),
        type: node.type as NodeType,
        mentionCount:
          node.type === 'user'
            ? 0
            : node.type === 'domain' && !activeDomainNodeIds.has(node.id)
              ? 0
              : Math.max(node._count.conversationRefs, 1),
        createdAt: node.createdAt.toISOString(),
        dormant: node.type === 'domain' && !activeDomainNodeIds.has(node.id),
        question:
          node.type === 'domain'
            ? CORE_DOMAIN_QUESTIONS[displayLabel(node.label) as keyof typeof CORE_DOMAIN_QUESTIONS]
            : undefined,
        insights: parseNodeInsights(node.insightSummary, node.insightBullets, node.insightGeneratedAt),
        context: parseNodeContext(node.contextText, node.contextUpdatedAt),
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
  rawLabel: string,
  { userId }: GraphOwner = {},
  createdNodeIds?: Set<string>
): Promise<string | null> {
  const normalized = normalizeLabel(rawLabel)
  if (normalized === 'user') return nodeIdsByLabel.get('user') ?? null

  if (nodeIdsByLabel.has(normalized)) {
    return nodeIdsByLabel.get(normalized) ?? null
  }

  const inferredType = inferTypeForTarget(rawLabel)
  if (inferredType === 'emotion') return null

  // Fix B: relationship endpoints must pass the same shape predicate as entities.
  // Prevents the LLM from sneaking junk labels in via relationship.from/to.
  if (inferredType !== 'domain' && isRejectableLabel(normalized)) {
    console.warn('[graph] rejected relationship endpoint label:', rawLabel)
    return null
  }

  const nodeId = await upsertNodeTracked(rawLabel, inferredType, { userId }, createdNodeIds)
  nodeIdsByLabel.set(normalized, nodeId)
  return nodeId
}

async function upsertNodeTracked(
  rawLabel: string,
  type: NodeType,
  { userId }: GraphOwner,
  createdNodeIds?: Set<string>
): Promise<string> {
  const canonicalLabel = canonicalGraphLabel(rawLabel)
  const normalized = normalizeLabel(canonicalLabel)
  const existing = await prisma.graphNode.findFirst({ where: { ...ownerWhere(userId), label: normalized } })
  const nodeId = await upsertNode(rawLabel, type, { userId })
  if (!existing && createdNodeIds) createdNodeIds.add(nodeId)
  return nodeId
}

async function createFallbackConversationTag(conversationId: string, { userId }: GraphOwner = {}): Promise<string> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { title: true },
  })

  const fallbackLabel = conversation?.title?.trim() || 'Life'
  return upsertNode(fallbackLabel, inferTypeForTarget(fallbackLabel), { userId })
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
  nodeIdsByLabel: Map<string, string>,
  { userId }: GraphOwner = {},
  createdNodeIds?: Set<string>,
  skipOwnPlacement = false
) {
  const canonicalLabel = canonicalGraphLabel(label)
  const normalized = normalizeLabel(canonicalLabel)
  if (type === 'domain' || normalized === 'user') return

  const domainLabel = inferTierOneDomain(canonicalLabel, type)
  if (!domainLabel) return

  const domainId = await getOrCreateNamedNode(domainLabel, 'domain', nodeIdsByLabel, { userId }, createdNodeIds)
  await upsertRelationship(userNodeId, domainId, 'has_domain', { userId })

  if (type === 'role') {
    if (!skipOwnPlacement) await upsertRelationship(nodeId, domainId, 'part_of', { userId })
    return
  }

  const roleLabel = inferRoleContainer(canonicalLabel)
  if (roleLabel) {
    const roleId = await getOrCreateNamedNode(roleLabel, 'role', nodeIdsByLabel, { userId }, createdNodeIds)
    await upsertRelationship(roleId, domainId, 'part_of', { userId })
    if (!skipOwnPlacement) await upsertRelationship(nodeId, roleId, 'member_of', { userId })
    return
  }

  if (!skipOwnPlacement) await upsertRelationship(nodeId, domainId, 'part_of', { userId })
}

async function ensurePersonRoleContainers(
  entities: Array<{ name: string; type: NodeType }>,
  nodeIdsByLabel: Map<string, string>,
  { userId }: GraphOwner = {}
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

    // Coworkers and Team are interchangeable as the work-people container.
    // The LLM picks whichever; named persons mentioned alongside either
    // should route under Work, not the Relationships default.
    const containerLabel = roleLabels.has('coworkers') ? 'coworkers' : roleLabels.has('team') ? 'team' : null
    if (containerLabel) {
      const containerId = nodeIdsByLabel.get(containerLabel)
      if (containerId) {
        await upsertRelationship(personId, containerId, 'member_of')
        await removeRelationship(personId, nodeIdsByLabel.get('relationships'), 'part_of', { userId })
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
  nodeIdsByLabel: Map<string, string>,
  { userId }: GraphOwner = {},
  createdNodeIds?: Set<string>
) {
  const normalized = normalizeLabel(label)
  const existing = nodeIdsByLabel.get(normalized)
  if (existing) return existing

  const nodeId = await upsertNodeTracked(label, type, { userId }, createdNodeIds)
  nodeIdsByLabel.set(normalized, nodeId)
  return nodeId
}

async function upsertRelationship(fromId: string, toId: string, relationship: string, { userId }: GraphOwner = {}) {
  if (fromId === toId) return

  const existing = await prisma.graphEdge.findFirst({
    where: { ...ownerWhere(userId), fromId, toId, relationship },
    select: { id: true },
  })
  if (existing) return

  await prisma.graphEdge.create({
    data: { fromId, toId, relationship, userId: userId ?? null },
  })
}

async function removeRelationship(
  fromId: string,
  toId: string | undefined,
  relationship: string,
  { userId }: GraphOwner = {}
) {
  if (!toId) return
  await prisma.graphEdge.deleteMany({ where: { ...ownerWhere(userId), fromId, toId, relationship } })
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
    'family',
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

    // Activity gerunds (in the allow-list) default by flavor:
    if (/^[a-z]+ing$/.test(normalized)) {
      if (['engineering', 'consulting', 'teaching', 'training', 'mentoring'].includes(normalized)) return 'Work'
      if (['journaling', 'meditating', 'praying', 'learning'].includes(normalized)) return 'Self'
      return 'Hobbies'
    }

    // Unknown role with no other signal — default to Work. The LLM emits
    // company names, projects, and team labels as type:"role", so Work is the
    // safest fallback. Better an imperfect placement than a dropped node.
    return 'Work'
  }

  return null
}

function inferRoleContainer(label: string): string | null {
  const normalized = normalizeLabel(label)

  if (isFamilyPerson(normalized)) return 'Family'

  return null
}

function isFamilyPerson(normalizedLabel: string) {
  return new Set(['dad', 'mom', 'brother', 'sister', 'son', 'daughter']).has(normalizedLabel)
}

function parseNodeContext(text: string | null, updatedAt: Date | null) {
  if (!text || !updatedAt) return null
  return {
    text,
    updatedAt: updatedAt.toISOString(),
  }
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
