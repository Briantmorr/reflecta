# Mirror Spec

## Product Shape

Mirror = graph-first reflective app.

Layout:

- left: node summary + related conversations
- center: primary map surface
- right: active reflection panel, expandable for reading

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
- imported conversations render like in-app conversations
- committed `prisma/dev.db` is the Vercel/demo snapshot

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
- every visible non-core node must have a placement edge into a tier-one domain or a supported container

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
- graph fills its pane after side-panel width changes

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
- deterministic placement edges are preferred over arbitrary LLM edge labels
- named people default to `Relationships`
- named people nest under containers only when supported, e.g. `Lena -> Friends -> Relationships`
- aliases normalize before placement, e.g. `Helping -> Service`, `Proving -> Desire For Approval`

## Conversation UI

- convo panel = right-side support, not primary entry
- active reflection can expand/compact for reviewing long past conversations
- map not collapsible
- app opens into blank convo w/ one starter
- draft reflection saved only when user sends
- selecting graph nodes != creating convo record
- selecting graph nodes does not replace an active saved conversation
- selecting graph nodes may swap starter question only when active reflection has no saved conversation
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
- related conversations collapsed by default
- node insights = second panel below related conversations
- current insights can be placeholder: `Key patterns: desire for respect, work bleeding over, need for spaciousness`
- long-term: insights become tasteful synthesis, patterns, reports per node
- click another node -> switch node view
- click empty graph space -> exit node view

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

## Import Snapshot

- import source: `seed_conversations/`
- command: `npm run import:conversations`
- supported V1 formats: OpenAI-style JSON, `.txt`, `.md`
- `Conversation.sourceRef` is sha256 of raw bytes and prevents duplicate imports
- `--force` removes prior imported conversations and re-tags
- imports use same conversation tagger path plus import transcript trimming and author hint
- local dev usually reads `dev.db`; demo/Vercel snapshot reads committed `prisma/dev.db`
