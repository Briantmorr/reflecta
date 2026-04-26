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
- app persistence target is durable Postgres

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
- nodes should have one best direct parent in the visible hierarchy
- if a container exists, children attach to that container, not also to the tier-one domain
- example: `You -> Relationships -> Family -> Mom`, not both `Mom -> Relationships` and `Mom -> Family`

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
- visible graph edges are hierarchy/placement edges, not every semantic relationship in the conversation
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
- node insights = second panel below related conversations for non-`You` selections
- node insights surface patterns, tensions, and synthesis across the node's tagged conversations
- node context = panel below node insights for single-node selections
- selecting `You` labels this section `User profile`; all other single nodes label it `Node context`
- node context is factual memory, not interpretation: key facts, relationships, roles, current state, preferences, ongoing situations
- node context is editable by the user so they can correct, refine, or remove distilled memory
- node context can be regenerated from the tagged conversations for that node
- current insights/context may start sparse; long-term they become durable memory + tasteful synthesis per node
- click another node -> switch node view
- click empty graph space -> exit node view

## Memory Model

Mirror now has two distinct memory surfaces per node:

1. **Node insights** = interpretive synthesis
2. **Node context** = factual memory

Rules:

- insights and context must stay separate in prompt design and UI framing
- insights are for patterns, themes, tensions, and reflective synthesis
- context is for durable facts a future conversation should be able to rely on without re-asking
- each graph node may store its own node context
- the `You` node is the top-most memory surface and acts as the user's global profile
- node context should be compact, high-signal, and easy to scan/edit
- user edits are source-of-truth corrections, not just temporary overrides

## Context Generation

- new prompt: `node-context`
- input = existing node context + conversations tagged to that node
- output = one compact factual memory block
- generation behavior should merge, not rewrite blindly:
  keep still-true facts, add new facts, update changed facts, drop contradicted facts
- newest transcript wins on conflicts unless the user manually edits the memory afterward
- context wording should favor short declarative lines / markdown-friendly sections, not paragraphs
- context should avoid advice, interpretation, therapy-speak, and unsupported inference

## Future Memory Plan

Next pass moves from isolated node memory toward composable context.

Planned prompt grounding for a node conversation:

1. user profile (`You` node context)
2. current conversation history
3. current node context
4. parent / containing node context when relevant

Principles:

- composition should stay small and high-signal; memory is not full transcript replay
- parent context should provide orientation, not drown out the local node
- user profile should ground durable identity facts across all nodes
- current conversation should remain the highest-priority live signal
- memory must remain user-editable at the node level before more automated composition is added

Deferred:

- auto-refresh node context during or after the tagging/update-map pipeline
- composing multiple context layers directly into conversation prompts
- more explicit precedence rules between manual edits, existing memory, and newly generated updates
- possible future structured memory model behind the editable text surface

## Persistence Direction

Near-term product refactor:

- primary app datastore is Postgres
- deployment target = Vercel project connected to Postgres via Marketplace integration
- ORM remains Prisma
- `DATABASE_URL` becomes the single primary database connection for local, preview, and production
- Vercel/runtime should rely on `DATABASE_URL`, not bundled database files

Why:

- conversations, graph nodes, graph edges, auth tables, conversation tags, and node memory are relational data
- node context is now a durable product surface and must support user edits, history, and per-user isolation
- keeping core product data in Prisma + Postgres gives one durable persistence model for app data and prompt versions

## Storage Model

Canonical storage should live in Postgres for:

- users / sessions / auth tables
- conversations and messages
- graph nodes / edges / node tags
- node insights
- node context
- node-context version history
- prompt versions and active prompt selection

## Prompt Persistence

- prompt versions live in Postgres
- prompt editor reads and writes through Prisma-backed tables
- prompt resolution order becomes:
  active DB version when enabled, then local `prompts/*.json`, then hardcoded fallback
- local JSON prompt files stay committed defaults and development fallback

This keeps prompt editing in the same persistence model as the rest of the app.

## Node Context Persistence

Node context is now durable product memory.

Requirements:

- current snapshot remains on `GraphNode` for fast reads
- user edits must persist durably
- regeneration must persist durably
- source should be distinguishable (`generated` vs `user_edit`)
- history / rollback should be possible

Planned shape:

- `GraphNode.contextText`
- `GraphNode.contextUpdatedAt`
- `GraphNode.contextSource`
- `NodeContextVersion` table for append-only history

Write behavior:

- regenerate context:
  append version row, update current snapshot
- user edit context:
  append version row, update current snapshot, mark source as `user_edit`

## User Scoping

Graph storage is user-scope ready.

Requirements:

- conversations belong to one user
- graph nodes and edges belong to one user
- node context belongs to one user through its node
- prompt versions are currently app-global

The relational model includes explicit ownership keys for graph nodes and graph edges.

## Deployment Plan

Target deployment path:

- create Postgres instance from Vercel Marketplace
- connect DB to Vercel project so `DATABASE_URL` is injected automatically
- run Prisma migrations against that database
- keep `postinstall: prisma generate`
- app data, node context, and prompt versions persist through Postgres

Preview environments should use isolated Postgres databases or branch-safe preview URLs when supported by the provider.

## LLM

- Provider: OpenAI
- Model: `gpt-5.4`
- API: Responses API
- prompt resolution order: DB-backed active version when enabled, then local `prompts/*.json`, then hardcoded fallback

Turn responses should:

- sound perceptive, calm, concise
- distill patterns, not generic reassurance
- connect current reflection to prior context when supported
- explore user's life with them, not lecture
- ask at most one grounded follow-up
- no research/stats unless asked

Node context generation should:

- produce factual memory only
- merge existing context with newly tagged conversations
- power both per-node memory and the `You` node's user profile
- stay editable after generation

## Prompt Editor

- temporary dev feature under settings/profile
- gated by `ENABLE_PROMPT_EDITOR=true` and `PROMPT_EDITOR_SECRET`
- remote prompt persistence target = Postgres via Prisma server routes
- editable prompts: persona, conversation turn, conversation tagger, node insights, node context
- prompts render as readable multiline text, not escaped JSON
- saving creates a new version and activates it
- previous versions can be loaded into the editor or re-activated
- local `prompts/*.json` stay committed fallback defaults

## Import Snapshot

- import source: `seed_conversations/`
- command: `npm run import:conversations`
- supported V1 formats: OpenAI-style JSON, `.txt`, `.md`
- `Conversation.sourceRef` is sha256 of raw bytes and prevents duplicate imports
- `--force` removes prior imported conversations and re-tags
- imports use same conversation tagger path plus import transcript trimming and author hint
- local dev and deploys both read the configured `DATABASE_URL`

## Dev DB Snapshot

Purpose:

- preserve a known-good development state with conversations, graph structure, tags, and node context
- allow returning to an empty app without losing that curated state
- make seeded node-memory testing repeatable

Current fixture:

- path: `prisma/seed-data/dev-snapshot.json`
- includes:
  conversations, messages, graph nodes, graph edges, conversation-node tags, message-node refs, node context version history
- excludes:
  prompt versions, active prompt config, auth/session/account rows

Commands:

- save current configured DB app data into the fixture:
  `npm run db:snapshot:dev`
- restore the fixture into the configured DB:
  `npm run db:load:dev-snapshot`
- clear app data back to empty:
  `npm run db:clear:app-data`

Restore behavior:

- deletes existing app data first
- recreates rows with preserved IDs
- preserves node links, conversation tags, node context history, timestamps, and conversation history
- leaves prompt tables untouched

Safety:

- all commands use `DATABASE_URL`
- check `.env` / `.env.local` before running against Vercel or any shared database
- use `db:clear:app-data` only when intentionally resetting conversations, nodes, links, and node context
