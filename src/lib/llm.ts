import { Graph, LLMResult, Message, NodeType } from '@/types'
import { normalizeLabel } from '@/lib/utils'
import { mockLLMCall } from '@/lib/mockLLM'
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

const DEFAULT_PERSONA = `You are Mirror.

You are a reflective companion whose purpose is to help one person gradually see the shape of their own life. You do this through conversation and through a living map — a graph of the people, places, roles, and themes that matter to them.

Your disposition:
- Genuinely curious. You want to understand who this person is, not perform understanding.
- Warm but not soft. You notice things clearly and say them plainly.
- Patient. You are building a picture over many conversations, not extracting a profile in one.
- Observant. You catch patterns, contradictions, and continuity that the user might not see yet.
- Grounded. You stay close to what the user actually said. You never invent connections or overclaim.

Your relationship to the map:
- The map is the durable artifact. Conversations come and go, but the map accumulates.
- You are always quietly asking yourself: what did I learn about this person that belongs on their map?
- You care about the map being honest and earned — every node should reflect something real, not something guessed.
- You resist clutter. A lean map with real structure is worth more than a busy one.

What you are not:
- Not a therapist. You don't diagnose, treat, or manage risk.
- Not a coach. You don't set goals or hold people accountable.
- Not a cheerleader. You don't offer empty encouragement.
- Not a search engine. You don't cite research or give advice unless asked.

Your voice:
- Short sentences. Concrete language.
- You say what you see, then ask one good question.
- You sound like a thoughtful friend who has been paying attention, not a professional who is performing empathy.`

const DEFAULT_SYSTEM_PROMPT = `You are responding to a single turn in an ongoing conversation. You will also extract graph entities from the user's message.

Response instructions:
1. Start with a brief, specific acknowledgement of what the user said — not a restatement, a distillation.
2. If prior graph context or conversation history reveals a meaningful connection, name it in one sentence. Only make connections that are actually supported.
3. End with one grounded follow-up question that helps reveal something real about the user's life — a person, a pattern, a tension, a value.

Response format:
- 2 to 3 sentences total. No more.
- Do not pad with filler, qualifiers, or reassurance.

Extraction instructions:
- Extract entities that are explicitly present or strongly implied in the user's message.
- Prefer durable entities: people (by name), roles, life domains.
- Normalize family references by role and context: "my father" -> "Dad", "my mother" -> "Mom", "becoming a father" or "new dad" -> "Fatherhood", "job" -> "Work".
- The user entity should be labeled "User".
- Keep relationship labels short, snake_case, and semantically specific.
- If nothing is worth extracting, return empty arrays.
- Return valid JSON matching the schema exactly.

Example:
User: "I've been thinking about how work has bled into everything lately."
Response: "Work isn't staying in its lane — it sounds like it's reshaping the rest of your days too. What does that bleed look like on an ordinary evening?"`

const DEFAULT_TAGGER_PROMPT = `You are tagging a completed conversation to update the user's life map.

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
- If the user clearly names a hobby, craft, sport, art form, practice, or interest, include it as a role node under Hobbies. Good: Hobbies -> Pottery. Bad: Hobbies alone.
- Names are high-signal life-map nodes. If the user names a real person, strongly consider including that name as a person node.
- If the user names a coworker, colleague, teammate, client, family member, partner, or friend, include the named person unless the mention is clearly incidental.
- Prefer durable structure like Relationships, Work, Self, Lifestyle, Coworkers, Mom, Dad, Jen, Brother, Clients, Home, Routine, Fatherhood, Responsibility, Pottery.
- When a specific person is known, prefer their actual name as a person node, not a generic label.
- Do not conflate the user's parent with the user's own future parenthood. "My dad" means Dad; "I'm going to be a dad" means Fatherhood.
- Use generic group nodes like Coworkers, Parents, Siblings, Clients as role/group containers.
- Good: Work -> Coworkers -> Jen. Bad: Work -> Coworker.
- Good: Work -> Coworkers -> Jason when Jason is described as a coworker.
- If you include a named person like Jen or Jason and they belong to a group, also include the parent group node.
- Avoid generic filler like "life", "feelings", "stress", "thoughts", "conversation".
- Avoid creating new nodes unless the conversation clearly supports them; named people and explicitly named hobbies/interests usually clear this bar.
- Favor structures like Relationships -> Dad, Mom or Work -> Coworkers -> Jen or Self -> Fatherhood or Hobbies -> Pottery or Lifestyle -> Home.
- Relationships should be enough to place nodes in the map.
- The user should be named "User".
- If an existing node is a good fit, use its exact label.
- Return valid JSON matching the schema exactly.`

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

function getPersona() {
  return readPromptFile('mirror_persona.json', DEFAULT_PERSONA)
}

function getSystemPrompt() {
  return getPersona() + '\n\n---\n\n' + readPromptFile('conversation-turn.json', DEFAULT_SYSTEM_PROMPT)
}

function getTaggerPrompt() {
  return getPersona() + '\n\n---\n\n' + readPromptFile('conversation-tagger.json', DEFAULT_TAGGER_PROMPT)
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
    .map((entity) => normalizeTagEntity(entity, transcript))
  const enrichedEntities = enrichTagEntities(entities, transcript).slice(0, 6)
  const enrichedEntityLabels = new Set(enrichedEntities.map((entity) => normalizeLabel(entity.name)))
  const inferredRelationships = inferTagRelationships(enrichedEntities, transcript)
  const relationships = sanitized.relationships
    .filter((relationship) => {
      const from = normalizeLabel(relationship.from)
      const to = normalizeLabel(relationship.to)
      return !EMOTION_LABELS.has(from) && !EMOTION_LABELS.has(to)
    })
    .filter((relationship) => {
      const from = normalizeLabel(relationship.from)
      const to = normalizeLabel(relationship.to)
      return enrichedEntityLabels.has(from) && enrichedEntityLabels.has(to)
    })
    .concat(inferredRelationships)
    .filter((relationship, index, list) => {
      const key = `${normalizeLabel(relationship.from)}:${relationship.type}:${normalizeLabel(relationship.to)}`
      return list.findIndex((candidate) => {
        return `${normalizeLabel(candidate.from)}:${candidate.type}:${normalizeLabel(candidate.to)}` === key
      }) === index
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
  if (transcript.trim().length === 0) {
    return [...deduped.values()]
  }

  const normalizedTranscript = normalizeLabel(transcript)
  if (nonDomainCount < 2) {
    const heuristics: Array<{ regex: RegExp; entity: { name: string; type: NodeType } }> = [
      { regex: /\bsoftware engineer(ing)?\b/i, entity: { name: 'Software Engineering', type: 'role' } },
      { regex: /\barchitect(ure|ural)?\b/i, entity: { name: 'Architecture', type: 'role' } },
      { regex: /\b(ai|artificial intelligence|gpt|chatgpt)\b/i, entity: { name: 'AI', type: 'role' } },
      { regex: /\bphilosophy|philosopher\b/i, entity: { name: 'Philosophy', type: 'role' } },
      { regex: /\bhackathon(s)?\b/i, entity: { name: 'Hackathons', type: 'role' } },
      { regex: /\bcommunity meetup(s)?|meetup(s)?\b/i, entity: { name: 'Community', type: 'role' } },
      { regex: /\bcoworker(s)?|colleague(s)?|teammate(s)?\b/i, entity: { name: 'Coworkers', type: 'role' } },
      { regex: /\bclient(s)?|customer(s)?\b/i, entity: { name: 'Clients', type: 'role' } },
      { regex: /\b(new dad|becoming (a )?(dad|father)|going to be (a )?(dad|father)|fatherhood|parenthood)\b/i, entity: { name: 'Fatherhood', type: 'role' } },
      { regex: /\bdad|father\b/i, entity: { name: isUserBecomingParent(transcript) ? 'Fatherhood' : 'Dad', type: isUserBecomingParent(transcript) ? 'role' : 'person' } },
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
  }

  const namedCoworkers = extractNamedCoworkers(transcript)
  const hobbyActivities = extractHobbyActivities(transcript)

  for (const personName of namedCoworkers) {
    add({ name: 'Coworkers', type: 'role' })
    add({ name: personName, type: 'person' })
  }

  for (const activityName of hobbyActivities) {
    add({ name: 'Hobbies', type: 'domain' })
    add({ name: activityName, type: 'role' })
  }

  const namedCoworkerLabels = new Set(namedCoworkers.map((name) => normalizeLabel(name)))
  const hobbyActivityLabels = new Set(hobbyActivities.map((name) => normalizeLabel(name)))

  return [...deduped.values()].sort((left, right) => {
    const leftLabel = normalizeLabel(left.name)
    const rightLabel = normalizeLabel(right.name)
    const leftPriority =
      (namedCoworkerLabels.has(leftLabel) ? 1 : 0) +
      (hobbyActivityLabels.has(leftLabel) ? 1 : 0)
    const rightPriority =
      (namedCoworkerLabels.has(rightLabel) ? 1 : 0) +
      (hobbyActivityLabels.has(rightLabel) ? 1 : 0)
    return rightPriority - leftPriority
  })
}

function inferTagRelationships(
  entities: Array<{ name: string; type: NodeType }>,
  transcript: string
): LLMResult['relationships'] {
  const labels = new Set(entities.map((entity) => normalizeLabel(entity.name)))
  const relationships: LLMResult['relationships'] = []

  if (labels.has('coworkers')) {
    relationships.push({ from: 'Coworkers', to: 'Work', type: 'part_of' })

    for (const personName of extractNamedCoworkers(transcript)) {
      if (labels.has(normalizeLabel(personName))) {
        relationships.push({ from: personName, to: 'Coworkers', type: 'member_of' })
      }
    }
  }

  if (labels.has('fatherhood')) {
    relationships.push({ from: 'Fatherhood', to: 'Self', type: 'part_of' })
  }

  for (const activityName of extractHobbyActivities(transcript)) {
    if (labels.has(normalizeLabel(activityName))) {
      relationships.push({ from: activityName, to: 'Hobbies', type: 'part_of' })
    }
  }

  return relationships
}

function extractNamedCoworkers(transcript: string): string[] {
  if (!/\b(coworker|coworkers|colleague|colleagues|teammate|teammates)\b/i.test(transcript)) {
    return []
  }

  const names = new Set<string>()
  const userLines = transcript
    .split('\n')
    .filter((line) => /^User:/i.test(line))
    .map((line) => line.replace(/^User:\s*/i, ''))

  for (const line of userLines) {
    const directPatterns = [
      /\b(?:coworker|colleague|teammate)\s+([a-z][a-z'-]{1,})\b/gi,
      /\b([A-Z][a-z][a-z'-]{1,})\s+(?:is|has|seems|was|keeps|always|never)\b/g,
    ]

    for (const pattern of directPatterns) {
      for (const match of line.matchAll(pattern)) {
        addPersonCandidate(names, match[1])
      }
    }
  }

  return [...names].slice(0, 3)
}

function addPersonCandidate(names: Set<string>, rawName: string | undefined) {
  if (!rawName) return
  const normalized = normalizeLabel(rawName)
  if (!normalized || PERSON_NAME_STOPWORDS.has(normalized)) return
  names.add(displayName(normalized))
}

function displayName(normalized: string) {
  return normalized
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function extractHobbyActivities(transcript: string): string[] {
  const names = new Set<string>()
  const userLines = transcript
    .split('\n')
    .filter((line) => /^User:/i.test(line))
    .map((line) => line.replace(/^User:\s*/i, ''))

  for (const line of userLines) {
    const patterns = [
      /\b(?:new\s+)?([a-z][a-z'-]{2,})\s+(?:hobby|practice|craft|project)\b/gi,
      /\b(?:hobby|practice|craft)\s+(?:of\s+)?([a-z][a-z'-]{2,})\b/gi,
      /\b(?:i\s+)?(?:love|enjoy|like|miss|started|start|picked up|got into|am into|i'm into|ive been into|i've been into)\s+([a-z][a-z'-]{2,})(?:\b|ing\b)/gi,
    ]

    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        addActivityCandidate(names, match[1])
      }
    }
  }

  return [...names].slice(0, 3)
}

function addActivityCandidate(names: Set<string>, rawName: string | undefined) {
  if (!rawName) return
  const normalized = normalizeLabel(rawName)
  if (!normalized || ACTIVITY_STOPWORDS.has(normalized) || PERSON_NAME_STOPWORDS.has(normalized)) return
  names.add(displayName(normalized))
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

const PERSON_NAME_STOPWORDS = new Set([
  'i',
  'im',
  'ive',
  'id',
  'he',
  'she',
  'they',
  'we',
  'it',
  'its',
  'my',
  'the',
  'a',
  'an',
  'work',
  'credit',
  'coworker',
  'coworkers',
  'colleague',
  'colleagues',
  'teammate',
  'teammates',
  'mirror',
  'user',
])

const ACTIVITY_STOPWORDS = new Set([
  'this',
  'that',
  'new',
  'old',
  'the',
  'and',
  'for',
  'with',
  'about',
  'work',
  'life',
  'hobby',
  'practice',
  'craft',
  'project',
  'gift',
  'gifts',
  'christmas',
])

function normalizeTagEntity(entity: LLMResult['entities'][number], transcript = '') {
  const normalized = normalizeLabel(entity.name)

  if (isUserBecomingParent(transcript)) {
    if (['dad', 'father', 'family', 'parent', 'parents', 'parenthood', 'fatherhood'].includes(normalized)) {
      return { name: 'Fatherhood', type: 'role' as NodeType }
    }
  }

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

function isUserBecomingParent(transcript: string) {
  return /\b(i'?m|i am|i'?ll|i will|going to be|becoming|about to be)\s+(a\s+)?(new\s+)?(dad|father|parent)\b/i.test(transcript) ||
    /\b(new dad|new father|fatherhood|parenthood)\b/i.test(transcript)
}
