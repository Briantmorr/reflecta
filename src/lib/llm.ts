import { Graph, LLMResult, Message, NodeType } from '@/types'
import { normalizeLabel } from '@/lib/utils'
import { mockLLMCall, onboardingPrompt as mockOnboardingPrompt } from '@/lib/mockLLM'
import fs from 'node:fs'
import path from 'node:path'

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

const DEFAULT_SYSTEM_PROMPT = `You are Mirror, a curious reflective companion helping the user explore their life and gradually build a living node map of who they are.

Your task each turn:
1. Digest what the user is really saying.
2. Start with a brief acknowledgement or distilled summary in one sentence.
3. If there is an interesting connection to prior conversations or graph context, name it clearly in one sentence.
4. Ask one useful question that moves the conversation forward and helps reveal something real about the user's life.
5. Extract durable graph entities and relationships from the user's message.

Response personality:
- Curious, observant, grounded.
- Interested in discovering who this person is, what matters to them, and how different parts of their life connect.
- Delighted by real patterns and meaningful continuity, but never overclaims.
- More like a thoughtful guide than a therapist, coach, or cheerleader.

Response format:
- Usually 2 or 3 sentences total.
- Sentence 1: acknowledgement / distilled summary.
- Sentence 2: optional connection to an existing pattern, person, role, or life area if supported.
- Final sentence: one grounded follow-up question.

Response rules:
- Stay close to the user's actual words and specifics.
- Prefer concise acknowledgement over generic reassurance.
- If the user talks about a clear theme, summarize it directly. Example: "It sounds like you're very involved in AI, and not just professionally."
- If prior notes or graph context suggest a meaningful link, surface it naturally.
- Only make connections that are actually supported by prior context.
- Use the question to deepen the map: discover people, roles, routines, motivations, tensions, or values.
- Ask at most one question.
- Avoid filler like "That sounds hard" unless it contains real insight.
- Avoid therapeutic clichés, hype, or vague encouragement.
- Avoid citing studies, research, or statistics unless explicitly asked.

Rules for extraction:
- The user should be named "User".
- Only extract entities that are explicitly present or strongly implied.
- Prefer durable entities: people, roles, life domains, emotions.
- Normalize obvious variants: "father" -> "Dad", "mother" -> "Mom", "job" -> "Work".
- Keep relationship labels short, snake_case, and semantically specific.
- If no entity or relationship is warranted, return an empty array.
- Return valid JSON matching the schema exactly.

Example:
User says: "I've been thinking about how work has bled into everything lately."
Better response:
"It sounds like work is no longer staying contained to work. Given how central work has been in your recent reflections, this may be one of the main ways pressure is shaping the rest of your life right now. What does work bleeding into everything look like in an ordinary day for you?"`

const DEFAULT_TAGGER_PROMPT = `You are building a minimal node map of a person's life from one completed conversation.

Your goal:
- Tag the conversation with a few durable nodes.
- Reuse existing nodes when possible.
- Keep the map lean and hierarchical.

Rules:
- Return 1 to 6 entities, never zero.
- Do not return emotion nodes.
- The only tier-one domains are Self, Health, Work, Relationships, Hobbies, and Lifestyle.
- Tier-one domains should anchor the map. Everything else should build beneath them.
- Do not return only tier-one domains when the conversation clearly contains specific subnodes.
- If a specific subnode is present, include it. Good: Work + Software Engineering + AI. Bad: Work alone.
- Prefer durable structure like Relationships, Work, Self, Lifestyle, Coworkers, Mom, Dad, Jen, Brother, Clients, Home, Routine.
- When a specific person is known, prefer their actual name as a person node, not a generic label.
- Use generic group nodes like Coworkers, Parents, Siblings, Clients as role/group containers.
- Good: Work -> Coworkers -> Jen. Bad: Work -> Coworker.
- If you include a named person like Jen and they belong to a group, also include the parent group node.
- Avoid generic filler like "life", "feelings", "stress", "thoughts", "conversation".
- Avoid creating new nodes unless the conversation clearly supports them.
- Favor structures like Relationships -> Dad, Mom or Work -> Coworkers -> Jen or Lifestyle -> Home.
- Relationships should be enough to place nodes in the map.
- The user should be named "User".
- If an existing node is a good fit, use its exact label.
- Return valid JSON matching the schema exactly.`

const DEFAULT_ONBOARDING_PROMPT = `You are Mirror, a reflective companion starting a brand-new conversation.

Write a short onboarding opener:
- 2 short paragraphs maximum
- warm, clear, and grounded
- invite specificity, not abstraction
- ask exactly one concrete opening question
- bias toward durable life areas like self, relationships, work, health, hobbies, or lifestyle
- avoid therapy-speak, hype, or sounding robotic`

type PromptFile = { prompt?: string }

const promptCache = new Map<string, string>()

function readPromptFile(filename: string, fallback: string): string {
  if (process.env.NODE_ENV === 'production' && promptCache.has(filename)) {
    return promptCache.get(filename) ?? fallback
  }

  try {
    const filePath = path.join(process.cwd(), 'prompts', filename)
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as PromptFile
    const prompt =
      typeof parsed.prompt === 'string' && parsed.prompt.trim().length > 0
        ? parsed.prompt
        : fallback

    if (process.env.NODE_ENV === 'production') {
      promptCache.set(filename, prompt)
    }

    return prompt
  } catch {
    return fallback
  }
}

function getSystemPrompt() {
  return readPromptFile('conversation-turn.json', DEFAULT_SYSTEM_PROMPT)
}

function getTaggerPrompt() {
  return readPromptFile('conversation-tagger.json', DEFAULT_TAGGER_PROMPT)
}

function getOnboardingPromptTemplate() {
  return readPromptFile('onboarding.json', DEFAULT_ONBOARDING_PROMPT)
}

type InputMessage = {
  role: 'system' | 'user' | 'assistant'
  content: Array<
    | { type: 'input_text'; text: string }
    | { type: 'output_text'; text: string }
  >
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
    systemPrompt: getSystemPrompt(),
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
    return sanitizeTagResult(mockLLMCall(transcript), transcript)
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
                getTaggerPrompt(),
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

  return sanitizeTagResult(JSON.parse(rawText) as LLMResult, transcript)
}

export async function generateOnboardingPrompt(): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return mockOnboardingPrompt()
  }

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
          content: [{ type: 'input_text', text: getOnboardingPromptTemplate() }],
        },
      ],
      text: { format: { type: 'text' } },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI onboarding failed (${response.status}): ${errorText}`)
  }

  const payload = (await response.json()) as OpenAIResponse
  if (payload.error?.message) {
    throw new Error(payload.error.message)
  }

  return extractOutputText(payload) || mockOnboardingPrompt()
}

function buildInputMessages({
  userMessage,
  conversationMessages,
  graph,
  systemPrompt,
}: {
  userMessage: string
  conversationMessages: Message[]
  graph: Graph
  systemPrompt: string
}): InputMessage[] {
  const history = conversationMessages.slice(-10).map<InputMessage>((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [
      {
        type: message.role === 'assistant' ? 'output_text' : 'input_text',
        text: message.content,
      },
    ],
  }))

  const graphContext = buildGraphContext(graph, userMessage, conversationMessages)

  return [
    {
      role: 'system',
      content: [
        {
          type: 'input_text',
          text: [
            systemPrompt,
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

function sanitizeTagResult(result: LLMResult, transcript = ''): LLMResult {
  const sanitized = sanitizeLLMResult(result)
  const entities = sanitized.entities
    .filter((entity) => entity.type !== 'emotion')
    .map(normalizeTagEntity)
  const enrichedEntities = enrichTagEntities(entities, transcript).slice(0, 6)
  const relationships = sanitized.relationships
    .filter((relationship) => {
      const from = normalizeLabel(relationship.from)
      const to = normalizeLabel(relationship.to)
      return !EMOTION_LABELS.has(from) && !EMOTION_LABELS.has(to)
    })
    .slice(0, 10)

  if (enrichedEntities.length > 0) {
    return { response: sanitized.response, entities: enrichedEntities, relationships }
  }

  return {
    response: sanitized.response,
    entities: [{ name: 'Self', type: 'domain' }],
    relationships: [{ from: 'User', to: 'Self', type: 'has_context' }],
  }
}

function enrichTagEntities(
  entities: Array<{ name: string; type: NodeType }>,
  transcript: string
) {
  const deduped = new Map<string, { name: string; type: NodeType }>()

  const add = (entity: { name: string; type: NodeType }) => {
    const key = `${normalizeLabel(entity.name)}:${entity.type}`
    if (!deduped.has(key)) {
      deduped.set(key, entity)
    }
  }

  entities.forEach(add)

  const nonDomainCount = entities.filter((entity) => entity.type !== 'domain').length
  if (nonDomainCount >= 2 || transcript.trim().length === 0) {
    return [...deduped.values()]
  }

  const normalizedTranscript = normalizeLabel(transcript)
  const heuristics: Array<{ regex: RegExp; entity: { name: string; type: NodeType } }> = [
    { regex: /\bsoftware engineer(ing)?\b/i, entity: { name: 'Software Engineering', type: 'role' } },
    { regex: /\barchitect(ure|ural)?\b/i, entity: { name: 'Architecture', type: 'role' } },
    { regex: /\b(ai|artificial intelligence|gpt|chatgpt)\b/i, entity: { name: 'AI', type: 'role' } },
    { regex: /\bphilosophy|philosopher\b/i, entity: { name: 'Philosophy', type: 'role' } },
    { regex: /\bhackathon(s)?\b/i, entity: { name: 'Hackathons', type: 'role' } },
    { regex: /\bcommunity meetup(s)?|meetup(s)?\b/i, entity: { name: 'Community', type: 'role' } },
    { regex: /\bcoworker(s)?|colleague(s)?|teammate(s)?\b/i, entity: { name: 'Coworkers', type: 'role' } },
    { regex: /\bclient(s)?|customer(s)?\b/i, entity: { name: 'Clients', type: 'role' } },
    { regex: /\bdad|father\b/i, entity: { name: 'Dad', type: 'person' } },
    { regex: /\bmom|mother\b/i, entity: { name: 'Mom', type: 'person' } },
    { regex: /\bbrother\b/i, entity: { name: 'Brother', type: 'person' } },
    { regex: /\bsister\b/i, entity: { name: 'Sister', type: 'person' } },
    { regex: /\bpartner|wife|husband|boyfriend|girlfriend\b/i, entity: { name: 'Partner', type: 'person' } },
    { regex: /\bfriend(s)?\b/i, entity: { name: 'Friends', type: 'role' } },
    { regex: /\brunning|runner\b/i, entity: { name: 'Running', type: 'role' } },
    { regex: /\bwriting|writer\b/i, entity: { name: 'Writing', type: 'role' } },
    { regex: /\breading|reader\b/i, entity: { name: 'Reading', type: 'role' } },
    { regex: /\bmusic\b/i, entity: { name: 'Music', type: 'role' } },
    { regex: /\bhome|house|apartment\b/i, entity: { name: 'Home', type: 'role' } },
    { regex: /\broutine(s)?|habit(s)?\b/i, entity: { name: 'Routine', type: 'role' } },
  ]

  for (const { regex, entity } of heuristics) {
    if (regex.test(transcript) || regex.test(normalizedTranscript)) {
      add(entity)
    }
  }

  return [...deduped.values()]
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
