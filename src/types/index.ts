// ─── Domain types ─────────────────────────────────────────────
export type NodeType = 'user' | 'person' | 'role' | 'domain' | 'emotion'

export type MessageRole = 'user' | 'assistant' | 'system'

export interface Conversation {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messages?: Message[]
  tags?: ConversationTag[]
}

export interface ConversationListItem {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
  messageCount?: number
  tags?: ConversationTag[]
}

export interface ConversationTag {
  nodeId: string
  label: string
  type: NodeType
}

export interface Message {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  createdAt: string
  nodeRefs?: { nodeId: string }[]
}

export interface GraphNode {
  id: string
  label: string
  type: NodeType
  mentionCount: number
  createdAt: string
}

export interface GraphEdge {
  id: string
  fromId: string
  toId: string
  relationship: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface NodeView {
  nodeId: string
  label: string
}

// ─── LLM contract ─────────────────────────────────────────────
// The shape returned by both mockLLM and (future) real LLM
export interface ExtractedEntity {
  name: string
  type: NodeType
}

export interface ExtractedRelationship {
  from: string
  to: string
  type: string
}

export interface LLMResult {
  response: string
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
}
