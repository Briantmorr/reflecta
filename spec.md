# Mirror Spec

## Product

Mirror is a three-pane reflective app:

- Left: collapsible conversation history
- Center: active conversation
- Right: collapsible psyche graph

The experience should feel clean, modern, and minimal. Light mode is the default.

## Core Model

Mirror separates two LLM jobs:

1. Turn response
GPT-5.4 replies in the conversation using recent turns plus relevant graph context.

2. Conversation mapping
After a conversation, the user presses `Update map`. GPT-5.4 tags the full conversation with a small set of durable life nodes.

The visible graph is driven by conversation-level tags, not by per-message extraction.

## Graph Rules

- The graph should feel earned, not noisy.
- Emotions are not shown as graph nodes.
- Edge labels are hidden.
- `You` only connects to first-ring container nodes.
- Tier-one domains only render if they have visible children.

Tier-one domains:

- `Family`
- `Relationships`
- `Work`
- `Health`
- `Hobbies`

Everything else builds beneath those domains.

Preferred structures:

- `Family -> Dad`
- `Family -> Mom`
- `Work -> Coworkers -> Jen`

Avoid node bloat. Reuse existing nodes when possible. Prefer concrete names for people and generic container nodes for groups.

## Conversation Tagging

Each conversation must end up with one or more durable tags.

Tags:

- are stored per conversation
- are applied by the LLM when the user presses `Update map`
- appear at the top of the active conversation
- can be manually removed by the user
- update the graph immediately when changed

The tagger should keep the map lean:

- prefer existing nodes
- avoid generic filler like `life`, `stress`, `thoughts`
- avoid creating unnecessary new nodes
- prefer names like `Jen` over vague person labels like `Coworker`
- if a named person belongs in a group, include the group structure too

## Node View

Selecting a graph node enters node view.

In node view:

- the history pane expands
- conversation history is filtered to notes tagged with that node
- the selected node can be changed by clicking another node
- the history pane shows a dedicated node-view indicator card
- the main history header stays `Mirror history`

Collapsed history behavior:

- previous conversations are hidden entirely
- only the minimal rail controls remain visible

## UI

Current UI requirements:

- no-FOUC theme boot in layout
- settings modal with light/dark toggle
- conversation history collapsed by default
- graph and history panes are collapsible
- empty center state includes a real `Start conversation` button
- active conversation tags should feel present but not dominant
- node-view indicator should be more visible, using a translucent celadon treatment

## LLM

Provider:
- OpenAI

Model:
- `gpt-5.4`

API:
- Responses API

Env var:
- `OPENAI_API_KEY`

Turn responses should:

- reflect and distill patterns
- connect current thoughts to prior context when supported
- avoid generic reassurance
- avoid citing studies unless explicitly asked
- ask at most one grounded follow-up question

## Persistence

Current persistence is SQLite.

Main tables:

- `Conversation`
- `Message`
- `GraphNode`
- `GraphEdge`
- `MessageNode`
- `ConversationNode`

`ConversationNode` is the source of truth for visible conversation tags.

## API

Current routes:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/[id]`
- `DELETE /api/conversations/[id]`
- `GET /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/messages`
- `POST /api/conversations/[id]/tags`
- `DELETE /api/conversations/[id]/tags`
- `GET /api/graph`

Behavior:

- sending a message does not directly update the visible graph
- updating tags does update the visible graph
- removing a tag updates both the conversation and the graph

## Deployment Notes

- Vercel runtime uses a writable SQLite copy in `/tmp`
- build-time and runtime must use the same seeded DB source
- deployed smoke checks should verify:
  - home loads
  - start button renders
  - graph API responds
  - conversations API does not return `500`
  - create conversation succeeds

Repo-local testing skill:

- `.codex/skills/reflecta-deploy-check`

Smoke command:

- `npm run smoke:deploy`
