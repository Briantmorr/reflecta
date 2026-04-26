import { Graph, Message, NodeType } from '@/types'
import { normalizeLabel } from '@/lib/utils'

export interface RelevantNodeContext {
  nodeId: string
  label: string
  type: NodeType
  context: string | null
  reason: 'profile' | 'selected' | 'conversation' | 'relevant' | 'parent'
}

export function fetchRelevantNodeContexts({
  graph,
  userMessage,
  conversationMessages,
  selectedNodeIds = [],
  conversationTagNodeIds = [],
  maxRelevant = 4,
  maxTotal = 8,
}: {
  graph: Graph
  userMessage: string
  conversationMessages: Message[]
  selectedNodeIds?: string[]
  conversationTagNodeIds?: string[]
  maxRelevant?: number
  maxTotal?: number
}): RelevantNodeContext[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const selected = new Set(selectedNodeIds)
  const conversationTags = new Set(conversationTagNodeIds)
  const recentNodeRefs = new Set(
    conversationMessages
      .slice(-8)
      .flatMap((message) => message.nodeRefs?.map((ref) => ref.nodeId) ?? [])
  )

  const selectedAndConversation = new Set([
    ...selected,
    ...conversationTags,
    ...recentNodeRefs,
  ])

  const tokens = tokenize([
    userMessage,
    ...conversationMessages.slice(-6).map((message) => message.content),
  ].join('\n'))

  const scored = graph.nodes
    .filter((node) => node.type !== 'emotion')
    .map((node) => {
      const label = normalizeLabel(node.label)
      const context = normalizeLabel(node.context?.text ?? '')
      let score = 0

      if (node.type === 'user') score += 1_000
      if (selected.has(node.id)) score += 500
      if (conversationTags.has(node.id)) score += 140
      if (recentNodeRefs.has(node.id)) score += 120
      if (tokens.has(label)) score += 90

      for (const token of tokens) {
        if (token.length < 3) continue
        if (label.includes(token) || token.includes(label)) score += 24
        if (context.includes(token)) score += 8
      }

      return { node, score }
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)

  const included = new Map<string, RelevantNodeContext>()

  const add = (nodeId: string | undefined, reason: RelevantNodeContext['reason']) => {
    if (!nodeId || included.has(nodeId) || included.size >= maxTotal) return
    const node = nodesById.get(nodeId)
    if (!node || node.type === 'emotion') return
    if (!node.context?.text && reason !== 'selected') return

    included.set(nodeId, {
      nodeId: node.id,
      label: node.label,
      type: node.type,
      context: node.context?.text ?? null,
      reason,
    })
  }

  const userNode = graph.nodes.find((node) => node.type === 'user')
  add(userNode?.id, 'profile')

  for (const nodeId of selected) add(nodeId, 'selected')
  for (const nodeId of selectedAndConversation) add(nodeId, conversationTags.has(nodeId) ? 'conversation' : 'selected')

  let relevantCount = 0
  for (const { node } of scored) {
    if (included.has(node.id)) continue
    if (relevantCount >= maxRelevant) break
    add(node.id, 'relevant')
    relevantCount += 1
  }

  for (const nodeId of [...included.keys()]) {
    const node = nodesById.get(nodeId)
    if (!node || node.type === 'user' || node.type === 'domain') continue
    for (const parentId of directParentIds(graph, nodeId)) {
      add(parentId, 'parent')
    }
  }

  return [...included.values()]
}

function directParentIds(graph: Graph, nodeId: string) {
  return graph.edges
    .filter((edge) => edge.fromId === nodeId)
    .map((edge) => edge.toId)
}

function tokenize(text: string) {
  return new Set(
    normalizeLabel(text)
      .split(' ')
      .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
  )
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'but',
  'with',
  'that',
  'this',
  'have',
  'been',
  'into',
  'about',
  'what',
  'when',
  'where',
  'feel',
  'feels',
  'felt',
  'really',
  'just',
  'like',
])
