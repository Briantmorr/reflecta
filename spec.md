# Mirror — Technical Specification (Current V1)

## 1. Overview

Mirror is a three-pane reflective interface:

1. **Conversation History Explorer** on the left
2. **Conversation Interface** in the center
3. **Psyche Graph View** on the right

The product now separates two distinct LLM jobs:

- **Turn response**: GPT-5.4 replies conversationally during the chat
- **Conversation mapping**: GPT-5.4 tags a completed conversation into a lean life map when the user presses `Update map`

This keeps the graph intentional instead of mutating on every message.

---

## 2. Product Principles

- The graph should feel like an awakening map, not a noisy dump of extracted nouns.
- The map should stay lean and hierarchical.
- Emotions may matter conversationally, but they are not shown as graph nodes in the current UI.
- Conversation tags are explicit, editable, and stored per conversation.
- Tier-one nodes are fixed and only appear when real child structure exists beneath them.

---

## 3. System Architecture

### High-Level Flow

```
User Input
    ↓
GPT-5.4 Turn Response
    ↓
Conversation continues
    ↓
User clicks "Update map"
    ↓
GPT-5.4 Conversation Tagger
    ↓
Conversation Tags + Supporting Graph Structure
    ↓
Graph Re-render
```

### Current Responsibilities Split

**Conversation turn model**
- Respond in natural language
- Use recent conversation plus current graph as context
- Does not directly mutate visible graph structure

**Conversation tagging model**
- Digest the full conversation transcript
- Reuse existing nodes when possible
- Produce 1-6 durable tags minimum 1
- Build a minimal hierarchy
- Avoid node bloat

---

## 4. Core Components

### 4.1 Conversation Engine

**Responsibilities**
- Manage sessions
- Persist user and assistant turns
- Call GPT-5.4 for live reflective replies

**Inputs**
- User messages
- Relevant graph context

**Outputs**
- Assistant reply text

### 4.2 Conversation Tagging Engine

**Responsibilities**
- Process an entire conversation on demand
- Select a small set of durable life-map nodes
- Create or reuse supporting hierarchy
- Persist conversation-level tags

**Rules**
- Every conversation should have at least 1 tag
- Prefer concrete names over generic placeholders
- Prefer structures like `Work -> Coworkers -> Jen`
- Avoid emotional nodes in graph output
- Avoid over-creating nodes

### 4.3 Graph Engine

**Responsibilities**
- Maintain reusable graph nodes and edges
- Keep graph display minimal and hierarchical
- Derive visible graph from persisted conversation tags

**Tier-One Domains**
- `Family`
- `Relationships`
- `Work`
- `Health`
- `Hobbies`

**Display Rules**
- Tier-one domains only render if they have visible children
- `You` only connects to first-ring container nodes
- Leaf people should hang off containers like `Family` or `Coworkers`
- Emotions are excluded from the visible graph
- Edge labels are hidden in the UI

### 4.4 Context Retrieval Layer

**Responsibilities**
- Retrieve relevant graph nodes and edges for turn-time prompting
- Bias toward recent and matching nodes

**Current Strategy**
- Simple scoring by keyword overlap, recent references, and mention weight

### 4.5 Conversation History Explorer

**Responsibilities**
- List previous conversations
- Allow switching between sessions
- Collapse into a minimal rail

**Collapsed Behavior**
- Conversation history is hidden
- Only shell controls remain visible

---

## 5. Data Model

### Domain Types

```ts
type NodeType = 'user' | 'person' | 'role' | 'domain' | 'emotion'
```

### Graph Model

```ts
type Node = {
  id: string
  label: string
  type: 'user' | 'person' | 'role' | 'domain' | 'emotion'
}

type Edge = {
  from: string
  to: string
  relationship: string
}
```

### Conversation Tags

Each conversation stores its own selected graph tags.

```ts
type ConversationTag = {
  nodeId: string
  label: string
  type: 'person' | 'role' | 'domain'
}
```

### Persistence Tables

Current SQLite persistence includes:

- `Conversation`
- `Message`
- `GraphNode`
- `GraphEdge`
- `MessageNode`
- `ConversationNode`

`ConversationNode` is the key join table for the current visible graph model.

---

## 6. Frontend Architecture

### Layout

```
┌─────────────────┬──────────────────────┬─────────────────┐
│  Conversations  │       Dialogue       │  Psyche Graph   │
│   (collapsible) │   (primary surface)  │  (collapsible)  │
└─────────────────┴──────────────────────┴─────────────────┘
```

### UX Behavior

**Conversation UI**
- Light mode is the default
- Settings modal controls theme and panel collapse
- Conversation tags show at the top of the active conversation
- Tags can be manually removed
- `Update map` button appears at the bottom of the conversation pane

**Graph UI**
- Minimal React Flow visualization
- No edge labels
- No emotion nodes
- Tier-one hierarchy only
- Graph re-renders immediately after tag updates or tag removals

**History Explorer**
- Collapsed by default
- Hidden history when collapsed

---

## 7. LLM Integration

| Property | Value |
|---|---|
| Provider | OpenAI |
| Model | GPT-5.4 |
| API | Responses API |
| Env Var | `OPENAI_API_KEY` |

### Turn Response Contract

```json
{
  "response": "LLM reply text",
  "entities": [],
  "relationships": []
}
```

Turn-time extraction exists for prompt compatibility, but visible graph updates are not driven from each turn.

### Conversation Tagging Contract

```json
{
  "response": "Internal helper text",
  "entities": [
    { "name": "Work", "type": "domain" },
    { "name": "Coworkers", "type": "role" },
    { "name": "Jen", "type": "person" }
  ],
  "relationships": [
    { "from": "User", "to": "Work", "type": "has_domain" },
    { "from": "Coworkers", "to": "Work", "type": "part_of" },
    { "from": "Jen", "to": "Coworkers", "type": "member_of" }
  ]
}
```

### Prompting Constraints

- Reuse existing nodes whenever possible
- Keep tags lean
- Do not expose emotion nodes in the graph
- Favor named people over generic person labels
- Use group nodes like `Coworkers`, `Parents`, `Siblings`, `Clients` when structure is useful

---

## 8. Entry Point Logic

On a new conversation:

1. Create an empty conversation
2. Show onboarding guidance if the conversation has no messages
3. User and assistant exchange turns normally
4. When the user wants to map the conversation, they press `Update map`
5. GPT-5.4 tags the conversation
6. Tags persist and the graph updates immediately

---

## 9. Persistence Strategy

### Current V1

- Conversations and messages are stored in SQLite
- Graph nodes and edges are stored in SQLite
- Conversation-level tags are stored in `ConversationNode`
- Visible graph is derived from tagged conversations plus supporting hierarchy

### Future

- Per-user graph isolation
- Embedding-based retrieval
- More robust node normalization and merge tools
- Explicit graph editing tools

---

## 10. API Surface

### Current Routes

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/[id]`
- `DELETE /api/conversations/[id]`
- `GET /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/tags`
- `DELETE /api/conversations/[id]/tags`
- `GET /api/graph`

### Behavioral Notes

- Posting a message does not directly light up the graph
- Posting to `/tags` performs the explicit conversation mapping pass
- Deleting a tag updates both the conversation header and the graph

---

## 11. Non-Functional Requirements

- GPT response target: low-latency turn responses
- Graph should remain visually sparse and readable
- Node growth should be constrained
- UI should feel clean, modern, and minimal
- Theme changes should avoid FOUC

---

## 12. Open Questions

- How should person-name detection be improved to avoid generic placeholders?
- Should users be able to rename or merge nodes manually?
- When should stale or low-value nodes be pruned?
- How should per-user graph isolation be introduced?

---

## 13. Technical Opinions

- Next.js remains the correct app shell for combined UI and API work
- SQLite is still appropriate for fast local iteration
- GPT-5.4 is the right model for both reflective replies and lean tagging
- Graph logic should remain server-side
- Visible map structure should be opinionated, not fully model-driven

---

## Summary

Mirror is now a two-stage reflective system:

- **Conversation builds meaning**
- **Explicit tagging builds structure**

The current architecture favors:

- A lean life map over exhaustive extraction
- User-visible control over what enters the map
- Clear hierarchy anchored by a fixed first ring
- A minimal UI that makes the graph feel earned
