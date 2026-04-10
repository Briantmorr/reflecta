# Mirror Spec

## Product Shape

Mirror is a graph-first reflective app.

Layout:

- left: collapsible conversation history
- center: primary map surface
- right: collapsible conversation panel

Light mode is the default.

## Main Experience

- the map is the first thing the user sees
- the six core domains are always present around `You`
- dormant core domains are greyed out but still hoverable and clickable
- clicking a dormant domain starts a themed conversation
- conversation tags are applied after the user presses `Update map`
- the graph re-renders from conversation tags, not from per-message extraction

## Core Domains

- `Self` -> `Who am I?`
- `Health` -> `How am I doing?`
- `Work` -> `What do I do?`
- `Relationships` -> `Who am I connected to?`
- `Hobbies` -> `What do I enjoy?`
- `Lifestyle` -> `How do I live?`

Rules:

- these six make up the first ring
- `You` only connects to first-ring container nodes
- emotions do not appear as graph nodes
- edge labels are hidden
- node maps should feel earned, not noisy

## Graph Behavior

- tier-one nodes remain visible even before they have child structure
- dormant tier-one nodes stay visually muted until they gain children
- node hover should only react on connected links, not neighboring nodes
- selected nodes can still highlight related structure
- the first ring should sit in a snapped honeycomb-like layout
- graph chrome should stay minimal and readable

## Conversation Mapping

Mirror separates two LLM jobs:

1. **Turn response**: GPT responds to the active conversation using recent history plus relevant graph context
2. **Conversation tagging**: after a conversation, the user presses `Update map` and GPT returns a small set of durable tags

Tagging rules:

- every conversation should end up with 1 to 6 durable tags
- prefer existing nodes when possible
- avoid filler like `life`, `thoughts`, `feelings`, `stress`
- prefer concrete people like `Jen`
- prefer container nodes for groups like `Coworkers`, `Parents`, `Clients`
- favor structures like `Work -> Coworkers -> Jen`
- keep the map lean and resist node bloat

## Conversation UI

- the conversation panel is the right-side support surface, not the primary entry point
- the conversation panel is collapsible
- the map itself is not collapsible
- the empty state should include a real `Start conversation` button
- user and Mirror messages should be visually distinct while staying in palette
- conversation tags appear at the top of the active conversation
- tags can be manually removed and should update the graph immediately

## Node View

Selecting a graph node enters node view.

In node view:

- the history pane expands
- the history list filters to conversations tagged with that node
- the history header remains `Mirror history`
- a dedicated node-view indicator card appears above the filtered list
- clicking another node switches node view
- clicking empty graph space exits node view

Collapsed history behavior:

- previous conversations are hidden entirely
- only the minimal rail remains visible

## LLM

- Provider: OpenAI
- Model: `gpt-5.4`
- API: Responses API

Turn responses should:

- sound perceptive, calm, and concise
- distill patterns instead of offering generic reassurance
- connect current reflection to prior context when supported
- explore the user's life with them, not lecture them
- ask at most one grounded follow-up question
- avoid research/statistics unless explicitly asked
