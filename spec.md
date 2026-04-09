# Mirror — Technical Specification (V1)

## 1. Overview

Mirror is a three-pane application consisting of:

1. **Conversation History Explorer** (left panel)
2. **Conversation Interface** (center, primary interaction)
3. **Psyche Graph View** (right panel, linked to the conversation)

These systems continuously interact:

- **Conversation → Graph**: user messages produce entities/relationships that update the graph
- **Graph → Conversation**: relevant subgraphs are retrieved to give the LLM context for follow-up questions

---

## 2. System Architecture

### High-Level Flow

```
User Input
    ↓
LLM Processing (OpenAI GPT-5.4)
    ↓
Structured Extraction (entities + relationships)
    ↓
Graph Update Engine
    ↓
Graph Store (in-memory + persisted)
    ↓
Context Retrieval
    ↓
LLM Follow-up Response
```

---

## 3. Core Components

### 3.1 Conversation Engine

**Responsibilities**
- Manage chat session
- Send/receive messages from LLM
- Maintain conversational context

**Inputs**
- User messages
- Retrieved graph context

**Outputs**
- LLM response
- Structured extraction payload (JSON)

---

### 3.2 Graph Engine

**Responsibilities**
- Maintain the evolving user graph
- Normalize entities (e.g., "Dad" vs "Father")
- Create/update nodes and edges

**Graph Model**

```ts
type Node = {
  id: string
  label: string
  type: 'person' | 'role' | 'domain' | 'emotion' | 'user'
}

type Edge = {
  from: string   // Node id
  to: string     // Node id
  relationship: string
}
```

**Examples**
- `User → Family → Father`
- `User → Work → Job → Coworker`

---

### 3.3 Context Retrieval Layer

**Responsibilities**
- Retrieve relevant nodes / subgraphs
- Inject them into the LLM prompt

**V1 Strategy**
- Simple keyword / entity matching
- Return top-N related nodes

---

### 3.4 Conversation History Explorer

**Location**: Left panel

**Responsibilities**
- List previous conversations
- Allow switching between sessions

**Storage**: SQLite

**Schema**

```sql
conversations (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  created_at TIMESTAMP
)

messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT,
  role            TEXT,       -- 'user' | 'assistant' | 'system'
  content         TEXT,
  created_at      TIMESTAMP
)
```

---

## 4. Frontend Architecture

### Layout

```
┌─────────────────┬──────────────────────┬─────────────────┐
│  Conversations  │       Dialogue       │  Dynamic Graph  │
│   (left panel)  │     (main chat)      │  (right panel)  │
└─────────────────┴──────────────────────┴─────────────────┘
```

### Components

**4.1 Conversation UI**
- Chat interface (LLM + user turns)
- Streaming responses
- Input box

**4.2 Graph View**
- Visualization using React Flow
- Incremental node updates
- Centered on the "User" node

**4.3 History Explorer**
- List of conversations
- Click to load a session

---

## 5. LLM Integration

| Property | Value |
|---|---|
| Provider | OpenAI |
| Model | GPT-5.4 |
| Responsibilities | Respond conversationally, extract structured data |

### Expected Output Format

```json
{
  "response": "LLM reply text",
  "entities": [
    { "name": "Dad", "type": "person" }
  ],
  "relationships": [
    { "from": "User", "to": "Dad", "type": "child_of" }
  ]
}
```

> **V1 demo note**: a mock LLM in `src/lib/mockLLM.ts` implements this exact signature so the app runs end-to-end without API calls. Swapping it for the real OpenAI client is a one-line change.

---

## 6. Entry Point Logic

On new conversation:

1. System initiates onboarding prompts
2. LLM guides through 3–5 seed questions
3. Responses populate the initial graph

---

## 7. Persistence Strategy

### V1
- Conversations → SQLite
- Graph → SQLite (Node / Edge / MessageNode tables)

### Future
- Graph migrated to Postgres or a dedicated graph DB
- Embedding-based retrieval

---

## 8. CI/CD Pipeline

### Workflow
- Git provider: GitHub
- Merge to `main` → triggers Vercel deployment
- PRs get automatic preview deployments

### Vercel Setup
- Framework: Next.js
- Required env vars: `OPENAI_API_KEY`, `DATABASE_URL`

---

## 9. Non-Functional Requirements

- Low latency: <2–3s LLM response target
- Incremental graph updates
- Stateless frontend (session-based)

---

## 10. Open Questions

- Graph normalization strategy?
- Memory weighting of nodes?
- Should the graph be user-editable?
- Long-term storage strategy?

---

## 11. Future Enhancements

- Graph persistence layer
- Embedding-based retrieval
- Insight generation (weekly summaries)
- Multi-session aggregation
- Visual "value map" overlays
- **External Note Ingestion** — import notes/conversations as flattened, timestamped events that integrate into history
- **Timeline View for Nodes** — chronological sequence of all conversations where a given entity was referenced

---

## 12. Technical Opinions

- Next.js for unified frontend + backend
- SQLite for fast iteration
- GPT-5.4 for reasoning + extraction
- Keep graph logic server-side
- Optimize later with embeddings + vector DB

---

## Summary

Mirror is an evolving system where:

- **Conversation builds structure**
- **Structure improves conversation**

The architecture prioritizes:

- Fast iteration
- Clear data flow
- Extensibility toward deeper insight systems
