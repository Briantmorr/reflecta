# Mirror Spec

## Product Shape

Mirror = graph-first reflective app.

Layout:

- left: collapsible convo history
- center: primary map surface
- right: collapsible convo panel

Light mode default.

## Main Experience

- map shown first
- six core domains always around `You`
- dormant cores greyed, still hoverable/clickable
- click dormant domain -> selects node, loads single themed starter into empty convo
- default blank starter: `What's been on your mind lately?`
- starters = local UI copy, not LLM prompts
- convo tags applied after user hits `Update map`
- graph re-renders from convo tags, not per-message extraction

## Core Domains

- `Self` -> `Who am I?`
- `Health` -> `How am I doing?`
- `Work` -> `What do I do?`
- `Relationships` -> `Who am I connected to?`
- `Hobbies` -> `What do I enjoy?`
- `Lifestyle` -> `How do I live?`
- domain icons reflect topic: self/person, health/activity, work/briefcase, relationships/heart, hobbies/palette, lifestyle/home

Rules:

- these six = first ring
- `You` connects only to first-ring containers
- emotions != graph nodes
- edge labels hidden
- maps feel earned, not noisy

## Graph Behavior

- tier-one nodes visible before having children
- dormant tier-one muted until they gain children
- hover reacts only on connected links, not neighbors
- selected nodes can highlight related structure
- selecting nodes focuses ancestry, direct children, and direct neighbors; unrelated nodes/edges dim
- first ring = snapped honeycomb-ish layout
- edges draw as trimmed straight lines between node circles, with type-color gradients and pulse only on active highlighted paths
- bottom legend uses larger pills/icons for `You`, `Theme`, `Person`, `Group`
- chrome minimal, readable

## Conversation Mapping

Two LLM jobs separated:

1. **Turn response**: GPT replies to active convo using recent history + relevant graph context
2. **Conversation tagging**: after convo, user hits `Update map`, GPT returns small set of durable tags

Tagging rules:

- each convo ends with 1-6 durable tags
- prefer existing nodes
- avoid filler: `life`, `thoughts`, `feelings`, `stress`
- prefer concrete people like `Jen`
- prefer container nodes for groups: `Coworkers`, `Parents`, `Clients`
- favor structures like `Work -> Coworkers -> Jen`
- named coworkers should add both `Coworkers` and the named person when supported
- hobbies/interests should map under `Hobbies` when explicitly named
- distinguish user's own `Fatherhood` from user's `Dad`
- keep map lean, resist node bloat

## Conversation UI

- convo panel = right-side support, not primary entry
- convo panel collapsible
- map not collapsible
- app opens into blank convo w/ one starter
- draft reflection saved only when user sends
- selecting graph nodes != creating convo record
- user and Mirror messages visually distinct, stay in palette
- convo tags at top of active convo
- tags manually removable, update graph immediately

## Node View

Selecting graph node enters node view.

In node view:

- history header = `Node Summary`
- history pane expands
- selected node at top, styled to match selected-node highlight
- selecting `You` shows all convos
- selecting other node filters convos to notes tagged with it
- node convos collapsed by default
- node insights = second panel below node convos
- current insights can be placeholder: `Key patterns: desire for respect, work bleeding over, need for spaciousness`
- long-term: insights become tasteful synthesis, patterns, reports per node
- click another node -> switch node view
- click empty graph space -> exit node view

Collapsed history behavior:

- prior convos hidden entirely
- only minimal rail visible

## LLM

- Provider: OpenAI
- Model: `gpt-5.4`
- API: Responses API

Turn responses should:

- sound perceptive, calm, concise
- distill patterns, not generic reassurance
- connect current reflection to prior context when supported
- explore user's life with them, not lecture
- ask at most one grounded follow-up
- no research/stats unless asked
