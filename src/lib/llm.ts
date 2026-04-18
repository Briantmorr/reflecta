import { Graph, LLMResult, Message, NodeType } from '@/types'
import { normalizeLabel } from '@/lib/utils'
import { mockLLMCall } from '@/lib/mockLLM'
import fs from 'node:fs'
import path from 'node:path'

const OPENAI_API_URL = 'https://api.openai.com/v1/responses'
const OPENAI_MODEL = 'gpt-5.4'

const INSIGHT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'bullets'],
  properties: {
    summary: { type: 'string' },
    bullets: {
      type: 'array',
      items: { type: 'string' },
    },
  },
} as const

export interface NodeInsightResult {
  summary: string
  bullets: string[]
}

const DEFAULT_NODE_INSIGHTS_PROMPT = `You are reading every conversation the user has had that touches one or more specific nodes on their life map. Notice things the user hasn't noticed. Connect dots across conversations. Surface how seemingly separate parts of their life are linked.

Return exactly:
- summary: 2 to 3 sentences (~40 to 70 words), second person ("You..."), naming the through-line, tension, or posture AND making at least one explicit connection between this node and another part of the user's life that appears in the transcripts. Go past the topic.
- bullets: 3 to 5 short observations, 2-7 words each, Title-like phrasing, no trailing period. Each bullet is a pattern, tension, or connection — not an event or raw emotion. Prefer fewer, stronger bullets.

When multiple nodes are in focus, the bullets should especially illuminate the relationship between those nodes. Every bullet must be traceable to what the user actually said. Do not invent. Do not coach. Do not restate the node names. If signal is thin, say so honestly.`

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

const DEFAULT_TAGGER_PROMPT = `You are tagging one completed conversation to update a user's life map. The map is a lean, durable graph of the people, roles, and domains that genuinely shape this person's life. Capture what is load-bearing in their life, not what was mentioned in passing.

Return 1 to 6 entities, never zero, plus the relationships that connect them.

The only tier-one domains are Self, Health, Work, Relationships, Hobbies, Lifestyle. These anchor the map. Everything non-domain should connect to one, directly or via an intermediate role/group node. Do not invent new tier-one domains.

High-signal heuristics (the more an entity meets, the stronger the signal):
- Named: the user said a real, specific name — of a person, place, practice, or thing. Names are the single strongest node heuristic. Tag named people unless the mention is clearly incidental.
- Repeated: the entity recurs across the conversation. Repetition indicates durability.
- Specific: a concrete role, craft, activity, or context rather than an abstract feeling or generic category.
- Structural: the entity organizes other entities (a group, a place, a recurring context).
- Identity-shaping: the user describes this as part of who they are, what they do, who they love, where they live, or what they believe.

Never return:
- Emotions (stress, sadness, anger, fear, joy, pride, peace, love, hope, grief, etc.).
- Generic filler (life, feelings, thoughts, things, stuff, situation, conversation, struggles, issues).
- One-off mentions with no weight.
- Historical, public, or symbolic figures referenced illustratively (Abraham, Job, Jesus, celebrities, book characters). They are not part of the user's personal graph.

Structural rules:
- If a specific subnode is present, include it and its tier-one anchor.
- If a named person belongs to a group, include the group container (Coworkers, Clients, Parents, Siblings, Friends, Neighbors, Congregation).
- Parent vs. self-as-parent: "my dad" -> Dad (person, under Relationships). "becoming a dad" / "new dad" -> Fatherhood (role, under Self). Same pattern for Mom / Motherhood. Never conflate.
- Prefer actual names over generic labels when a name is known; keep the group container when it helps place the person.
- A hobby, craft, sport, art form, practice, or area of study is a role node under its natural domain (Hobbies for recreation, Work for career activities, Self for internal practices like prayer or journaling).
- The user entity is always labeled "User".
- If an existing node is a good fit, reuse its exact label rather than creating a near-duplicate.

Tag count calibration:
- Short conversation on one theme: 2-3 tags.
- Multi-turn conversation across several life areas: 4-6 tags.
- Do not pad. Do not starve. Match the conversation's actual substance.

Return valid JSON matching the schema exactly. Be decisive. The map is better lean and honest than wide and noisy.`

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

function getNodeInsightsPrompt() {
  return getPersona() + '\n\n---\n\n' + readPromptFile('node-insights.json', DEFAULT_NODE_INSIGHTS_PROMPT)
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
  const transcript = buildConversationTranscript(conversationMessages)

  return generateConversationTagsFromTranscript({ transcript, graph })
}

export async function generateImportConversationTags({
  conversationMessages,
  graph,
  maxTranscriptChars = 12_000,
}: {
  conversationMessages: Message[]
  graph: Graph
  maxTranscriptChars?: number
}): Promise<LLMResult> {
  const transcript = buildConversationTranscript(conversationMessages)
  const trimmedTranscript = trimImportTranscript(transcript, maxTranscriptChars)
  const hintedTranscript = [
    "(Note: the author of this transcript is the User. If a first name appears as the author's own name, do not tag it as a separate person node. Tag only other people the author discusses.)",
    trimmedTranscript,
  ].join('\n\n')

  return generateConversationTagsFromTranscript({ transcript: hintedTranscript, graph })
}

export interface NodeInsightConversation {
  title: string | null
  createdAt: string
  messages: Message[]
}

export interface NodeInsightNodeRef {
  label: string
  type: NodeType
}

export async function generateNodeInsights({
  nodes,
  conversations,
  maxCharsPerConversation = 6_000,
  maxTotalChars = 28_000,
}: {
  nodes: NodeInsightNodeRef[]
  conversations: NodeInsightConversation[]
  maxCharsPerConversation?: number
  maxTotalChars?: number
}): Promise<NodeInsightResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return buildMockNodeInsights(nodes, conversations)
  }

  const nodeDescription = nodes
    .map((node) => `- ${node.label} (${node.type})`)
    .join('\n')

  const transcripts = buildNodeInsightTranscripts(conversations, {
    maxCharsPerConversation,
    maxTotalChars,
  })

  if (!transcripts.trim()) {
    return {
      summary: "You haven't said much that touches this node yet; the picture is still forming.",
      bullets: ['Barely surfaced yet', 'Little signal so far', 'Needs more conversations'],
    }
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
          content: [
            {
              type: 'input_text',
              text: [
                getNodeInsightsPrompt(),
                nodes.length === 1
                  ? 'Node in focus:'
                  : 'Nodes in focus (insights should honor how the user relates to this combination):',
                nodeDescription,
                'Conversations tagged with the node(s) above (oldest first):',
                transcripts,
              ].join('\n\n'),
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'mirror_node_insights',
          schema: INSIGHT_SCHEMA,
          strict: true,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI node-insights failed (${response.status}): ${errorText}`)
  }

  const payload = (await response.json()) as OpenAIResponse
  const rawText = extractOutputText(payload)
  if (!rawText) {
    throw new Error('OpenAI node-insights returned no text output')
  }

  return sanitizeNodeInsights(JSON.parse(rawText) as NodeInsightResult)
}

function buildNodeInsightTranscripts(
  conversations: NodeInsightConversation[],
  { maxCharsPerConversation, maxTotalChars }: { maxCharsPerConversation: number; maxTotalChars: number }
) {
  const ordered = [...conversations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const chunks: string[] = []
  let total = 0

  for (const conversation of ordered) {
    const transcript = buildConversationTranscript(conversation.messages)
    if (!transcript.trim()) continue

    const trimmed = transcript.length > maxCharsPerConversation
      ? `${transcript.slice(0, Math.floor(maxCharsPerConversation * 0.4))}\n\n[...trimmed middle...]\n\n${transcript.slice(-Math.floor(maxCharsPerConversation * 0.6))}`
      : transcript

    const header = `--- Conversation: ${conversation.title ?? 'Untitled'} (${conversation.createdAt}) ---`
    const block = `${header}\n${trimmed}`

    if (total + block.length > maxTotalChars) {
      const remaining = maxTotalChars - total
      if (remaining > 400) {
        chunks.push(`${header}\n${trimmed.slice(0, remaining - header.length - 20)}\n[...trimmed...]`)
      }
      break
    }

    chunks.push(block)
    total += block.length
  }

  return chunks.join('\n\n')
}

function sanitizeNodeInsights(result: NodeInsightResult): NodeInsightResult {
  const summary =
    typeof result.summary === 'string' && result.summary.trim().length > 0
      ? result.summary.trim()
      : "You've only brushed against this node; the picture is still forming."

  const rawBullets = Array.isArray(result.bullets) ? result.bullets : []
  const cleaned = rawBullets
    .map((bullet) => (typeof bullet === 'string' ? bullet.trim().replace(/[.;]+$/, '') : ''))
    .filter((bullet) => bullet.length > 0)
    .slice(0, 5)

  while (cleaned.length < 3) {
    cleaned.push('Still taking shape')
  }

  return { summary, bullets: cleaned }
}

function buildMockNodeInsights(
  nodes: NodeInsightNodeRef[],
  conversations: NodeInsightConversation[]
): NodeInsightResult {
  const label = nodes.map((node) => node.label).join(' + ') || 'this node'
  if (conversations.length === 0) {
    return {
      summary: `You haven't said much about ${label} yet.`,
      bullets: ['Barely surfaced', 'Little signal so far', 'Needs more conversations'],
    }
  }
  return {
    summary: `You return to ${label} often enough that a pattern is beginning to show.`,
    bullets: ['Recurring attention', 'Mixed feelings', 'Still unresolved'],
  }
}

function buildConversationTranscript(conversationMessages: Message[]) {
  return conversationMessages
    .filter((message) => message.role !== 'system')
    .map((message) => `${message.role === 'assistant' ? 'Mirror' : 'User'}: ${message.content}`)
    .join('\n')
}

function trimImportTranscript(transcript: string, maxTranscriptChars: number) {
  if (transcript.length <= maxTranscriptChars) return transcript
  const start = transcript.slice(0, 4_000)
  const end = transcript.slice(-6_000)
  return `${start}\n\n[...trimmed middle...]\n\n${end}`
}

async function generateConversationTagsFromTranscript({
  transcript,
  graph,
}: {
  transcript: string
  graph: Graph
}): Promise<LLMResult> {
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
  const userTranscript = userOnlyTranscript(transcript)
  const hasExplicitHobby = extractHobbyActivities(transcript).length > 0 || /\b(hobby|hobbies|craft|sport|recreation|for fun)\b/i.test(userTranscript)
  const entities = sanitized.entities
    .filter((entity) => entity.type !== 'emotion')
    .map((entity) => normalizeTagEntity(entity, transcript))
    .filter((entity) => !TAG_ENTITY_STOPWORDS.has(normalizeLabel(entity.name)))
    .filter((entity) => normalizeLabel(entity.name) !== 'hobbies' || hasExplicitHobby)
    .filter((entity) => isSupportedByUserTranscript(entity, userTranscript))
  const enrichedEntities = enrichTagEntities(entities, transcript)
    .filter((entity) => !TAG_ENTITY_STOPWORDS.has(normalizeLabel(entity.name)))
    .filter((entity) => normalizeLabel(entity.name) !== 'hobbies' || hasExplicitHobby)
    .filter((entity) => isSupportedByUserTranscript(entity, userTranscript))
    .slice(0, 6)
  const relationships = inferTagRelationships(enrichedEntities, transcript)
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

function userOnlyTranscript(transcript: string) {
  return transcript
    .split('\n')
    .filter((line) => /^User:/i.test(line))
    .map((line) => line.replace(/^User:\s*/i, ''))
    .join('\n')
}

function isSupportedByUserTranscript(
  entity: { name: string; type: NodeType },
  userTranscript: string
) {
  const normalized = normalizeLabel(entity.name)
  const normalizedUserTranscript = normalizeLabel(userTranscript)

  if (entity.type === 'domain') {
    if (normalized === 'hobbies') return /\b(hobby|hobbies|craft|sport|recreation|for fun)\b/i.test(userTranscript)
    if (normalized === 'health') return /\b(health|body|sleep|sick|doctor|medical|exercise|run|running)\b/i.test(userTranscript)
    if (normalized === 'lifestyle') return /\b(home|house|apartment|routine|habit|schedule|travel|airport)\b/i.test(userTranscript)
    if (normalized === 'relationships') return /\b(dad|mom|father|mother|sister|brother|friend|partner|dating|marry|married|marriage|men|women|woman|man|parents)\b/i.test(userTranscript)
    return true
  }

  if (normalized === 'architecture') return /\barchitect|architecture\b/i.test(userTranscript)
  if (normalized === 'clients') return /\bclient|clients|customer|customers\b/i.test(userTranscript)
  if (normalized === 'physician') return false
  if (normalized === 'northbridge consulting') return /\bnorthbridge\b/i.test(userTranscript)
  if (normalized === 'project management') return /\bproject[- ]oriented|project management|project manager|project roles?\b/i.test(userTranscript)
  if (normalized === 'product management') return /\bproduct management|product manager|product roles?\b/i.test(userTranscript)
  if (normalized === 'reading') return /\breading|read\b/i.test(userTranscript)
  if (normalized === 'friends') return /\bfriend|friends\b/i.test(userTranscript)
  if (entity.type === 'person' && !normalizedUserTranscript.includes(normalized)) return false
  if (['running', 'music', 'reading'].includes(normalized)) {
    return normalizedUserTranscript.includes(normalized)
  }

  return true
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

  if (labels.has('friends')) {
    relationships.push({ from: 'Friends', to: 'Relationships', type: 'part_of' })

    for (const personName of extractNamedFriends(transcript)) {
      if (labels.has(normalizeLabel(personName))) {
        relationships.push({ from: personName, to: 'Friends', type: 'member_of' })
      }
    }
  }

  if (labels.has('dating')) {
    relationships.push({ from: 'Dating', to: 'Relationships', type: 'part_of' })

    for (const entity of entities) {
      const normalized = normalizeLabel(entity.name)
      if (entity.type === 'person' && !isFamilyTag(normalized)) {
        relationships.push({ from: entity.name, to: 'Dating', type: 'member_of' })
      }
    }
  }

  if (/\b(hobby|hobbies|craft|sport|recreation|for fun)\b/i.test(userOnlyTranscript(transcript))) {
    for (const activityName of extractHobbyActivities(transcript)) {
      if (labels.has(normalizeLabel(activityName))) {
        relationships.push({ from: activityName, to: 'Hobbies', type: 'part_of' })
      }
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

function extractNamedFriends(transcript: string): string[] {
  if (!/\b(friend|friends)\b/i.test(transcript)) {
    return []
  }

  const names = new Set<string>()
  const userLines = transcript
    .split('\n')
    .filter((line) => /^User:/i.test(line))
    .map((line) => line.replace(/^User:\s*/i, ''))

  for (const line of userLines) {
    const patterns = [
      /\bfriend(?:\s+of\s+mine)?\s+named\s+([A-Z][a-z][a-z'-]{1,})\b/g,
      /\bfriend\s+([A-Z][a-z][a-z'-]{1,})\b/g,
    ]

    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        addPersonCandidate(names, match[1])
      }
    }
  }

  return [...names].slice(0, 3)
}

function isFamilyTag(normalized: string) {
  return ['dad', 'mom', 'father', 'mother', 'brother', 'sister', 'parents', 'siblings', 'partner'].includes(normalized)
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
      /\b(?:new\s+)?([a-z][a-z'-]{2,})\s+(?:hobby|craft)\b/gi,
      /\b(?:hobby|craft)\s+(?:of\s+)?([a-z][a-z'-]{2,})\b/gi,
      /\b(?:i\s+)?(?:love|enjoy|like|miss|started|start|picked up)\s+([a-z][a-z'-]{2,})(?:\b|ing\b)/gi,
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
  'you',
  'it',
  'its',
  'my',
  'myself',
  'the',
  'a',
  'an',
  'work',
  'credit',
  'jesus',
  'god',
  'christ',
  'lord',
  'holy',
  'spirit',
  'abraham',
  'job',
  'ava',
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
  'one',
  'two',
  'into',
  'say',
  'said',
  'not',
  'when',
  'there',
  'things',
  'thing',
  'lifes',
  'life',
  'lives',
  'present',
  'patterns',
  'pattern',
  'multiple',
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

const TAG_ENTITY_STOPWORDS = new Set([
  'i',
  'im',
  'ive',
  'id',
  'he',
  'she',
  'they',
  'we',
  'you',
  'it',
  'its',
  'my',
  'myself',
  'the',
  'a',
  'an',
  'credit',
  'jesus',
  'god',
  'christ',
  'lord',
  'holy',
  'spirit',
  'abraham',
  'job',
  'ava',
  'mirror',
  'user',
  'one',
  'two',
  'into',
  'say',
  'said',
  'not',
  'when',
  'there',
  'things',
  'thing',
  'lifes',
  'life',
  'lives',
  'present',
  'patterns',
  'pattern',
  'multiple',
  'physician',
  'consulting',
  'product',
  'hard',
  'thoughts',
  'feelings',
  'conversation',
  'situation',
  'stuff',
  'issues',
  'struggles',
])

function normalizeTagEntity(entity: LLMResult['entities'][number], transcript = '') {
  const normalized = normalizeLabel(entity.name)

  if (normalized === 'marriageminded dating') {
    return { name: 'Marriage Minded Dating', type: 'role' as NodeType }
  }
  if (normalized === 'helping' || normalized === 'helping others') {
    return { name: 'Service', type: 'role' as NodeType }
  }
  if (normalized === 'proving') {
    return { name: 'Desire For Approval', type: 'role' as NodeType }
  }

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
