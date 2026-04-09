import { LLMResult, NodeType, ExtractedEntity, ExtractedRelationship } from '@/types'

/**
 * Mock LLM for demo/dev. Same signature as a future real LLM call.
 * Swapping to OpenAI later = replace this function's body.
 */

// ─── Entity patterns ─────────────────────────────────────────────
// Each pattern maps a set of keywords to a canonical entity + the edges
// the user's message implies.

interface Pattern {
  keywords: RegExp
  entity: ExtractedEntity
  edges?: ExtractedRelationship[]
  responseCategory: ResponseCategory
}

type ResponseCategory =
  | 'family'
  | 'partner'
  | 'work'
  | 'friend'
  | 'emotion_positive'
  | 'emotion_negative'
  | 'health'
  | 'hobby'
  | 'default'

const PATTERNS: Pattern[] = [
  // ── Family ────────────────────────────────────────────────
  {
    keywords: /\b(dad|father|daddy)\b/i,
    entity: { name: 'Dad', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Dad', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Dad', type: 'child_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\b(mom|mother|mum|mama)\b/i,
    entity: { name: 'Mom', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Mom', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Mom', type: 'child_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\b(brother|sibling)\b/i,
    entity: { name: 'Brother', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Brother', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Brother', type: 'sibling_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\b(sister)\b/i,
    entity: { name: 'Sister', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Sister', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Sister', type: 'sibling_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\b(son)\b/i,
    entity: { name: 'Son', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Son', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Son', type: 'parent_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\b(daughter)\b/i,
    entity: { name: 'Daughter', type: 'person' },
    edges: [
      { from: 'User', to: 'Family', type: 'domain_of' },
      { from: 'Daughter', to: 'Family', type: 'part_of' },
      { from: 'User', to: 'Daughter', type: 'parent_of' },
    ],
    responseCategory: 'family',
  },
  {
    keywords: /\bfamily\b/i,
    entity: { name: 'Family', type: 'domain' },
    edges: [{ from: 'User', to: 'Family', type: 'domain_of' }],
    responseCategory: 'family',
  },

  // ── Partner ───────────────────────────────────────────────
  {
    keywords: /\b(wife|husband|partner|spouse|girlfriend|boyfriend)\b/i,
    entity: { name: 'Partner', type: 'person' },
    edges: [
      { from: 'User', to: 'Relationships', type: 'domain_of' },
      { from: 'Partner', to: 'Relationships', type: 'part_of' },
      { from: 'User', to: 'Partner', type: 'partner_of' },
    ],
    responseCategory: 'partner',
  },

  // ── Work ──────────────────────────────────────────────────
  {
    keywords: /\b(job|work|career|office)\b/i,
    entity: { name: 'Work', type: 'domain' },
    edges: [{ from: 'User', to: 'Work', type: 'domain_of' }],
    responseCategory: 'work',
  },
  {
    keywords: /\b(boss|manager|supervisor)\b/i,
    entity: { name: 'Boss', type: 'person' },
    edges: [
      { from: 'User', to: 'Work', type: 'domain_of' },
      { from: 'Boss', to: 'Work', type: 'part_of' },
      { from: 'User', to: 'Boss', type: 'reports_to' },
    ],
    responseCategory: 'work',
  },
  {
    keywords: /\b(coworker|colleague|teammate|coworkers)\b/i,
    entity: { name: 'Coworker', type: 'person' },
    edges: [
      { from: 'User', to: 'Work', type: 'domain_of' },
      { from: 'Coworker', to: 'Work', type: 'part_of' },
      { from: 'User', to: 'Coworker', type: 'works_with' },
    ],
    responseCategory: 'work',
  },
  {
    keywords: /\b(client|customer)\b/i,
    entity: { name: 'Client', type: 'person' },
    edges: [
      { from: 'User', to: 'Work', type: 'domain_of' },
      { from: 'Client', to: 'Work', type: 'part_of' },
    ],
    responseCategory: 'work',
  },

  // ── Friends / relationships ───────────────────────────────
  {
    keywords: /\b(friend|friends|buddy|pal)\b/i,
    entity: { name: 'Friend', type: 'person' },
    edges: [
      { from: 'User', to: 'Relationships', type: 'domain_of' },
      { from: 'Friend', to: 'Relationships', type: 'part_of' },
      { from: 'User', to: 'Friend', type: 'friend_of' },
    ],
    responseCategory: 'friend',
  },

  // ── Health ────────────────────────────────────────────────
  {
    keywords: /\b(health|doctor|sick|illness|hospital|exercise|gym)\b/i,
    entity: { name: 'Health', type: 'domain' },
    edges: [{ from: 'User', to: 'Health', type: 'domain_of' }],
    responseCategory: 'health',
  },

  // ── Hobbies / passions ───────────────────────────────────
  {
    keywords: /\b(hobby|passion|music|art|reading|writing|cooking|running|hiking)\b/i,
    entity: { name: 'Hobbies', type: 'domain' },
    edges: [{ from: 'User', to: 'Hobbies', type: 'domain_of' }],
    responseCategory: 'hobby',
  },

  // ── Emotions: negative ────────────────────────────────────
  {
    keywords: /\b(stressed|stress|anxious|anxiety|overwhelmed|worried)\b/i,
    entity: { name: 'Stress', type: 'emotion' },
    edges: [{ from: 'User', to: 'Stress', type: 'feels' }],
    responseCategory: 'emotion_negative',
  },
  {
    keywords: /\b(sad|depressed|down|lonely|grief)\b/i,
    entity: { name: 'Sadness', type: 'emotion' },
    edges: [{ from: 'User', to: 'Sadness', type: 'feels' }],
    responseCategory: 'emotion_negative',
  },
  {
    keywords: /\b(angry|frustrated|mad|irritated|annoyed)\b/i,
    entity: { name: 'Anger', type: 'emotion' },
    edges: [{ from: 'User', to: 'Anger', type: 'feels' }],
    responseCategory: 'emotion_negative',
  },
  {
    keywords: /\b(afraid|fear|scared|terrified)\b/i,
    entity: { name: 'Fear', type: 'emotion' },
    edges: [{ from: 'User', to: 'Fear', type: 'feels' }],
    responseCategory: 'emotion_negative',
  },

  // ── Emotions: positive ────────────────────────────────────
  {
    keywords: /\b(happy|joy|joyful|excited|thrilled|grateful)\b/i,
    entity: { name: 'Joy', type: 'emotion' },
    edges: [{ from: 'User', to: 'Joy', type: 'feels' }],
    responseCategory: 'emotion_positive',
  },
  {
    keywords: /\b(proud|accomplished|confident)\b/i,
    entity: { name: 'Pride', type: 'emotion' },
    edges: [{ from: 'User', to: 'Pride', type: 'feels' }],
    responseCategory: 'emotion_positive',
  },
  {
    keywords: /\b(calm|peaceful|content|relaxed)\b/i,
    entity: { name: 'Peace', type: 'emotion' },
    edges: [{ from: 'User', to: 'Peace', type: 'feels' }],
    responseCategory: 'emotion_positive',
  },
  {
    keywords: /\b(love|loving|loved)\b/i,
    entity: { name: 'Love', type: 'emotion' },
    edges: [{ from: 'User', to: 'Love', type: 'feels' }],
    responseCategory: 'emotion_positive',
  },
]

// ─── Response templates per category ────────────────────────────
const RESPONSE_TEMPLATES: Record<ResponseCategory, string[]> = {
  family: [
    'Tell me more about your family. Who are you closest to, and why?',
    'What does your relationship with them usually look like day to day?',
    "What's been on your mind about them lately?",
    'When you think about family, what feelings come up first?',
  ],
  partner: [
    'How would you describe your connection with them right now?',
    'What have the two of you been navigating together lately?',
    'What do you value most in that relationship?',
  ],
  work: [
    "What part of your work is energizing you right now? What's draining?",
    'Tell me about the people you work with most closely.',
    "If you could change one thing about your work, what would it be?",
    "How do you feel walking into work most mornings?",
  ],
  friend: [
    'Who in your life do you feel most seen by?',
    "What's something a friend has done recently that mattered to you?",
    'Are there friendships you wish were deeper?',
  ],
  emotion_positive: [
    "That's a beautiful thing to sit with. What's bringing that feeling up?",
    'When was the last time you felt this strongly before?',
    "What would it mean to hold onto this feeling longer?",
  ],
  emotion_negative: [
    'That sounds heavy. Can you say more about where it comes from?',
    "What do you think is underneath that feeling?",
    "When did you first notice it? Has it been building?",
    "If that feeling could speak, what would it be asking for?",
  ],
  health: [
    "How has your body been feeling lately?",
    "What does taking care of yourself look like right now?",
  ],
  hobby: [
    "What draws you to that? What does it give you?",
    "How often do you get to spend time on it?",
  ],
  default: [
    "Tell me more — what's behind that for you?",
    'How does that sit with you right now?',
    "What's the most important piece of this, in your view?",
    'Can you take me deeper into that?',
  ],
}

// ─── Public API ─────────────────────────────────────────────────

/**
 * Analyze a user message and return:
 * - a contextual response
 * - extracted entities (to become graph nodes)
 * - extracted relationships (to become graph edges)
 */
export function mockLLMCall(userMessage: string): LLMResult {
  const entities: ExtractedEntity[] = []
  const relationships: ExtractedRelationship[] = []
  const categoriesHit = new Set<ResponseCategory>()
  const seenEntityNames = new Set<string>()
  const seenRelKeys = new Set<string>()

  for (const pattern of PATTERNS) {
    if (!pattern.keywords.test(userMessage)) continue
    categoriesHit.add(pattern.responseCategory)

    // Add primary entity
    if (!seenEntityNames.has(pattern.entity.name)) {
      entities.push(pattern.entity)
      seenEntityNames.add(pattern.entity.name)
    }

    // Add implied entities from edges (e.g. "Family" domain when we see "Dad")
    for (const edge of pattern.edges ?? []) {
      const relKey = `${edge.from}→${edge.to}:${edge.type}`
      if (!seenRelKeys.has(relKey)) {
        relationships.push(edge)
        seenRelKeys.add(relKey)
      }
      // Make sure implied nodes also exist as entities
      for (const implied of [edge.from, edge.to]) {
        if (implied === 'User' || seenEntityNames.has(implied)) continue
        seenEntityNames.add(implied)
        entities.push({ name: implied, type: inferType(implied) })
      }
    }
  }

  // Pick a response template
  const category: ResponseCategory =
    categoriesHit.size > 0 ? pickFrom([...categoriesHit]) : 'default'
  const response = pickFrom(RESPONSE_TEMPLATES[category])

  return { response, entities, relationships }
}

/** Onboarding / seed question — used when a conversation is empty */
export function onboardingPrompt(): string {
  const prompts = [
    "Welcome. Let's start somewhere grounding — can you tell me about your family?",
    "I'd love to get to know you. What does your work look like these days?",
    "Who are the most important people in your life right now?",
    "What has been on your mind lately?",
    "What is currently causing you stress — or excitement?",
  ]
  return prompts[Math.floor(Math.random() * prompts.length)]
}

// ─── Helpers ────────────────────────────────────────────────────
function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function inferType(label: string): NodeType {
  const domainLabels = ['Family', 'Work', 'Relationships', 'Health', 'Hobbies']
  if (label === 'User') return 'user'
  if (domainLabels.includes(label)) return 'domain'
  return 'person'
}
