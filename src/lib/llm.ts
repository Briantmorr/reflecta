import { Graph, LLMResult, Message, NodeType } from '@/types'
import { normalizeLabel } from '@/lib/utils'
import { mockLLMCall } from '@/lib/mockLLM'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const OPENAI_MODEL = 'gpt-5.4'

const RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['response', 'entities', 'relationships'],
  properties: {
    response: { type: 'string' },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'type'],
        properties: {
          name: { type: 'string' },
          type: {
            type: 'string',
            enum: ['user', 'person', 'role', 'domain', 'emotion'],
          },
        },
      },
    },
    relationships: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['from', 'to', 'type'],
        properties: {
          from: { type: 'string' },
          to: { type: 'string' },
          type: { type: 'string' },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You are Mirror, a reflective conversation guide.

Your task each turn:
1. Respond conversationally in 2-4 sentences.
2. Ask at most one grounded follow-up question.
3. Extract durable graph entities and relationships from the user's message.

Rules for extraction:
- The user should be named "User".
- Only extract entities that are explicitly present or strongly implied.
- Prefer durable entities: people, roles, life domains, emotions.
- Normalize obvious variants: "father" -> "Dad", "mother" -> "Mom", "job" -> "Work".
- Keep relationship labels short, snake_case, and semantically specific.
- If no entity or relationship is warranted, return an empty array.
- Return valid JSON matching the schema exactly.`

const TAGGER_PROMPT = `You are building a minimal node map of a person's life from one completed conversation.

Your goal:
- Tag the conversation with a few durable nodes.
- Reuse existing nodes when possible.
- Keep the map lean and hierarchical.

Rules:
- Return 1 to 6 entities, never zero.
- Do not return emotion nodes.
- The only tier-one domains are Family, Relationships, Work, Health, and Hobbies.
- Tier-one domains should anchor the map. Everything else should build beneath them.
- Prefer durable structure like Family, Work, Coworkers, Mom, Dad, Jen, Brother, Clients.
- When a specific person is known, prefer their actual name as a person node, not a generic label.
- Use generic group nodes like Coworkers, Parents, Siblings, Clients as role/group containers.
- Good: Work -> Coworkers -> Jen. Bad: Work -> Coworker.
- If you include a named person like Jen and they belong to a group, also include the parent group node.
- Avoid generic filler like "life", "feelings", "stress", "thoughts", "conversation".
- Avoid creating new nodes unless the conversation clearly supports them.
- Favor structures like Family -> Dad, Mom or Work -> Coworkers -> Jen.
- Relationships should be enough to place nodes in the map.
- The user should be named "User".
- If an existing node is a good fit, use its exact label.
- Return valid JSON matching the schema exactly.`

type InputMessage = {
  role: 'system' | 'user' | 'assistant'
  content: Array<{ type: 'input_text'; text: string }>
}

type OpenAIResponse = {
  error?: { message?: string }
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

export async function generateConversationTurn({
  userMessage,
  conversationMessages,
  graph,
}: {
  userMessage: string
  conversationMessages: Message[]
  graph: Graph
}): Promise<LLMResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return mockLLMCall(userMessage)
  }

  const input = buildInputMessages({
    userMessage,
    conversationMessages,
    graph,
  })

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input,
      text: {
        format: {
          type: 'json_schema',
          name: 'mirror_llm_result',
          schema: RESULT_SCHEMA,
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI Responses API failed (${response.status}): ${errorText}`)
  }

  const payload = (await response.json()) as OpenAIResponse
  if (payload.error?.message) {
    throw new Error(payload.error.message)
  }

  const rawText = extractOutputText(payload)
  if (!rawText) {
    throw new Error('OpenAI Responses API returned no text output')
  }

  const parsed = JSON.parse(rawText) as LLMResult
  return sanitizeLLMResult(parsed)
}

export async function generateConversationTags({
  conversationMessages,
  graph,
}: {
  conversationMessages: Message[]
  graph: Graph
}): Promise<LLMResult> {
  const transcript = conversationMessages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Mirror' : 'User'}: ${message.content}`)
    .join('\n')

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return sanitizeTagResult(mockLLMCall(transcript))
  }

  const existingNodes = graph.nodes
    .filter((node) => node.type !== 'emotion')
    .map((node) => `- ${node.label} (${node.type})`)
    .join('\n')

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: [
                TAGGER_PROMPT,
                'Existing nodes:',
                existingNodes || '- none yet',
                'Conversation transcript:',
                transcript,
              ].join('\n\n'),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mirror_conversation_tags',
          schema: RESULT_SCHEMA,
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI tagger failed (${response.status}): ${errorText}`)
  }

  const payload = (await response.json()) as OpenAIResponse
  const rawText = extractOutputText(payload)
  if (!rawText) {
    throw new Error('OpenAI tagger returned no text output')
  }

  return sanitizeTagResult(JSON.parse(rawText) as LLMResult)
}

function buildInputMessages({
  userMessage,
  conversationMessages,
  graph,
}: {
  userMessage: string
  conversationMessages: Message[]
  graph: Graph
}): InputMessage[] {
  const history = conversationMessages.slice(-10).map<InputMessage>((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: message.content }],
  }))

  const graphContext = buildGraphContext(graph, userMessage, conversationMessages)

  return [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: [
            SYSTEM_PROMPT,
            'Relevant graph context:',
            graphContext,
          ].join('\n\n'),
        },
      ],
    },
    ...history,
    {
      role: 'user',
      content: [{ type: 'input_text', text: userMessage }],
    },
  ]
}

function buildGraphContext(
  graph: Graph,
  userMessage: string,
  conversationMessages: Message[]
): string {
  if (graph.nodes.length === 0) {
    return 'No graph context yet.'
  }

  const keywords = new Set(
    normalizeLabel(userMessage)
      .split(' ')
      .filter((token) => token.length >= 3)
  )
  const recentNodeIds = new Set(
    conversationMessages.slice(-6).flatMap((message) => message.nodeRefs?.map((ref) => ref.nodeId) ?? [])
  )

  const scoredNodes = graph.nodes
    .map((node) => {
      const label = normalizeLabel(node.label)
      let score = node.mentionCount

      if (recentNodeIds.has(node.id)) score += 6
      if (keywords.has(label)) score += 12
      if ([...keywords].some((token) => label.includes(token) || token.includes(label))) score += 4

      return { node, score }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ node }) => node)

  if (scoredNodes.length === 0) {
    return 'No graph context yet.'
  }

  const nodeIdSet = new Set(scoredNodes.map((node) => node.id))
  const relatedEdges = graph.edges
    .filter((edge) => nodeIdSet.has(edge.fromId) || nodeIdSet.has(edge.toId))
    .slice(0, 12)

  const nodeLines = scoredNodes.map(
    (node) => `- ${node.label} (${node.type}, mentions: ${node.mentionCount})`
  )
  const edgeLines = relatedEdges.map((edge) => {
    const from = graph.nodes.find((node) => node.id === edge.fromId)?.label ?? edge.fromId
    const to = graph.nodes.find((node) => node.id === edge.toId)?.label ?? edge.toId
    return `- ${from} -> ${edge.relationship} -> ${to}`
  })

  return [
    'Nodes:',
    ...nodeLines,
    edgeLines.length > 0 ? 'Relationships:' : 'Relationships: none',
    ...edgeLines,
  ].join('\n')
}

function extractOutputText(payload: OpenAIResponse): string {
  const texts: string[] = []

  for (const item of payload.output ?? []) {
    for (const contentItem of item.content ?? []) {
      if (typeof contentItem.text === 'string' && contentItem.text.length > 0) {
        texts.push(contentItem.text)
      }
    }
  }

  return texts.join('\n').trim()
}

function sanitizeLLMResult(result: LLMResult): LLMResult {
  const safeTypes = new Set<NodeType>(['user', 'person', 'role', 'domain', 'emotion'])
  const seenEntities = new Set<string>()
  const seenRelationships = new Set<string>()

  const entities = (result.entities ?? [])
    .filter((entity): entity is { name: string; type: NodeType } => {
      return (
        typeof entity?.name === 'string' &&
        entity.name.trim().length > 0 &&
        safeTypes.has(entity.type as NodeType)
      )
    })
    .map((entity) => ({
      name: entity.name.trim(),
      type: entity.type,
    }))
    .filter((entity) => {
      const key = `${normalizeLabel(entity.name)}:${entity.type}`
      if (seenEntities.has(key)) return false
      seenEntities.add(key)
      return true
    })
    .slice(0, 12)

  const relationships = (result.relationships ?? [])
    .filter((relationship) => {
      return (
        typeof relationship?.from === 'string' &&
        relationship.from.trim().length > 0 &&
        typeof relationship.to === 'string' &&
        relationship.to.trim().length > 0 &&
        typeof relationship.type === 'string' &&
        relationship.type.trim().length > 0
      )
    })
    .map((relationship) => ({
      from: relationship.from.trim(),
      to: relationship.to.trim(),
      type: normalizeRelationshipType(relationship.type),
    }))
    .filter((relationship) => {
      const key = `${relationship.from}:${relationship.type}:${relationship.to}`
      if (seenRelationships.has(key)) return false
      seenRelationships.add(key)
      return true
    })
    .slice(0, 16)

  return {
    response:
      typeof result.response === 'string' && result.response.trim().length > 0
        ? result.response.trim()
        : "Tell me a little more about what's most present for you right now.",
    entities,
    relationships,
  }
}

function sanitizeTagResult(result: LLMResult): LLMResult {
  const sanitized = sanitizeLLMResult(result)
  const entities = sanitized.entities
    .filter((entity) => entity.type !== 'emotion')
    .map(normalizeTagEntity)
    .slice(0, 6)
  const relationships = sanitized.relationships
    .filter((relationship) => {
      const from = normalizeLabel(relationship.from)
      const to = normalizeLabel(relationship.to)
      return !EMOTION_LABELS.has(from) && !EMOTION_LABELS.has(to)
    })
    .slice(0, 10)

  if (entities.length > 0) {
    return { response: sanitized.response, entities, relationships }
  }

  return {
    response: sanitized.response,
    entities: [{ name: 'Family', type: 'domain' }],
    relationships: [{ from: 'User', to: 'Family', type: 'has_context' }],
  }
}

function normalizeRelationshipType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'related_to'
}

const EMOTION_LABELS = new Set([
  'stress',
  'sadness',
  'anger',
  'fear',
  'joy',
  'pride',
  'peace',
  'love',
])

function normalizeTagEntity(entity: LLMResult['entities'][number]) {
  const normalized = normalizeLabel(entity.name)

  if (normalized === 'coworker' || normalized === 'coworkers') {
    return { name: 'Coworkers', type: 'role' as NodeType }
  }
  if (normalized === 'client' || normalized === 'clients') {
    return { name: 'Clients', type: 'role' as NodeType }
  }
  if (normalized === 'parent' || normalized === 'parents') {
    return { name: 'Parents', type: 'role' as NodeType }
  }
  if (normalized === 'sibling' || normalized === 'siblings') {
    return { name: 'Siblings', type: 'role' as NodeType }
  }

  return entity
}
