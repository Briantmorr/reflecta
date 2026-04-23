# Mirror

Mirror is a reflective journaling app built around a living map of a person's life. The graph is the main entry point. Conversations happen in the side panel, and completed conversations can be mapped into a lean, durable node graph.

## What The App Does

- centers the map, not the chat
- keeps six core domains always visible:
  - `Self`
  - `Health`
  - `Work`
  - `Relationships`
  - `Hobbies`
  - `Lifestyle`
- uses GPT-5.4 for:
  - turn-by-turn reflective replies
  - conversation-level tagging when the user presses `Update map`
- stores conversation tags per conversation and re-renders the graph from those tags
- supports node view: clicking a node filters the history pane to matching conversations

The graph stays intentionally lean:

- no emotion nodes
- no visible edge labels
- dormant core domains stay greyed out until they gain child structure
- `You` only connects to first-ring containers

## Repo Map

- [`src/app/page.tsx`](/Users/brianmorris/dev/projects/llm_journal/src/app/page.tsx): app shell and state wiring
- [`src/components/PsycheGraph.tsx`](/Users/brianmorris/dev/projects/llm_journal/src/components/PsycheGraph.tsx): primary graph UI and layout
- [`src/components/ChatInterface.tsx`](/Users/brianmorris/dev/projects/llm_journal/src/components/ChatInterface.tsx): conversation side panel
- [`src/components/ConversationList.tsx`](/Users/brianmorris/dev/projects/llm_journal/src/components/ConversationList.tsx): history pane and node view
- [`src/lib/llm.ts`](/Users/brianmorris/dev/projects/llm_journal/src/lib/llm.ts): OpenAI integration and prompt loading
- [`src/lib/graph.ts`](/Users/brianmorris/dev/projects/llm_journal/src/lib/graph.ts): graph/tag persistence rules
- [`prompts/README.md`](/Users/brianmorris/dev/projects/llm_journal/prompts/README.md): prompt file workflow
- [`spec.md`](/Users/brianmorris/dev/projects/llm_journal/spec.md): current product contract

## Local Setup

```bash
npm install
cp .env.example .env.local
cp .env.example .env
# edit DATABASE_URL to point at Postgres
npm run db:push
npm run dev
```

Useful database commands:

```bash
# Reset schema only
npm run db:reset-empty

# Reset and seed demo conversations
npm run db:reset

# Seed the current DB without resetting
npm run db:seed

# Import seed_conversations/ into the configured Postgres database
npm run import:conversations

# Re-import from scratch, replacing prior imported conversations
npm run import:conversations -- --force
```

By default:

- local auth is off
- Postgres is used
- local dev reads `DATABASE_URL`
- Vercel should inject `DATABASE_URL` from its connected Postgres provider
- durable production target is Postgres via Prisma on Vercel
- if `OPENAI_API_KEY` is missing, the app falls back to the mock LLM

If you change the Prisma schema, run `npm run db:push` before restarting `npm run dev`.

Local dev uses the standard Next compiler. Turbopack is currently avoided because the Prisma Postgres driver adapter can fail route requests under `next dev --turbo`.

## Prompt Editing

Prompts live in `prompts/` as JSON files so you can iterate on tone and behavior without touching app code:

| File | Controls |
|------|----------|
| `mirror_persona.json` | Mirror's identity and voice — prepended to every LLM call |
| `conversation-turn.json` | Per-message reflective replies and entity extraction |
| `conversation-tagger.json` | Post-conversation tagging (the "Update map" step) |
| `node-insights.json` | Node summary synthesis for selected graph nodes |
| `node-context.json` | Factual node memory / user profile distilled from tagged conversations |

Each file has one field:

```json
{
  "prompt": "Your prompt text here"
}
```

### How prompt loading works

- In **development**, prompts are read fresh from disk on every request — just edit and refresh.
- In **production**, prompts are cached in memory after first read.
- If a file is missing or malformed, `src/lib/llm.ts` falls back to a hardcoded default.

### Tuning tips

**Persona** (`mirror_persona.json`):
- This is Mirror's soul. It gets prepended to every LLM call (turns and tagging).
- Controls disposition (curious, warm, grounded), voice (short sentences, concrete), and boundaries (not a therapist, not a coach).
- Also defines Mirror's relationship to the map — how it thinks about what's worth keeping.
- Edit this to change who Mirror fundamentally is. Task-specific instructions stay in the other files.

**Turn prompt** (`conversation-turn.json`):
- This prompt runs on every user message. It controls both the conversational reply and the entity/relationship extraction returned as structured JSON.
- The response format section controls length and structure. Currently tuned for 2-3 sentences.
- The extraction rules control what ends up in the graph. Adjust normalization rules here (e.g. "father" → "Dad").
- If responses feel generic, tighten the "stay close to the user's actual words" rule or add examples.
- If extraction is noisy, raise the bar in the "only extract entities that are explicitly present" rule.

**Tagger prompt** (`conversation-tagger.json`):
- This runs once when the user presses "Update map". It receives the full conversation and existing graph nodes.
- The 1-6 tag range and hierarchy rules (e.g. `Work -> Coworkers -> Jen`) are the main levers.
- If the map grows too fast, tighten the "avoid creating new nodes" and "reuse existing nodes" rules.
- If tags are too vague, add more examples of good vs bad tagging.

**Starter questions**:
- The default blank conversation starter is local UI copy: `What's been on your mind lately?`
- Selecting a blank node swaps in a single node-specific starter question.
- Starter questions are not generated by the LLM.

### Testing prompt changes

1. Edit the JSON file in `prompts/`
2. With the dev server running, send a message or start a new conversation — changes apply immediately
3. Check the response tone, length, and extracted entities
4. If using mock LLM (no `OPENAI_API_KEY`), prompt changes have no effect — the mock returns canned responses

### Dev prompt editor

The settings/profile modal includes a temporary Prompt Editor for non-technical prompt iteration. It is disabled unless explicitly configured.

Required env:

```bash
ENABLE_PROMPT_EDITOR=true
ENABLE_REMOTE_PROMPTS=true
PROMPT_EDITOR_SECRET=shared-dev-secret
```

Behavior:

- UI edits are saved as Postgres-backed prompt versions and immediately activated.
- `prompts/*.json` remain the readable repo fallback.
- LLM calls resolve prompts as DB active version first, local JSON fallback second.
- API access requires `x-prompt-editor-secret`; do not enable this on a public deployment without a shared secret.

Seed DB prompt versions from the committed prompt files:

```bash
npm run prompts:seed
```

The seed is idempotent: it reuses an existing matching version when possible, otherwise creates one version per prompt and activates it.

## Environment

Main vars:

- `OPENAI_API_KEY`: enables real GPT-5.4 responses and tagging
- `DATABASE_URL`: required Postgres connection string
- `AUTH_ENABLED`: turns sign-in on or off
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: required only when auth is enabled
- `ENABLE_PROMPT_EDITOR`, `ENABLE_REMOTE_PROMPTS`, `PROMPT_EDITOR_SECRET`: optional dev prompt editor

See [.env.example](/Users/brianmorris/dev/projects/llm_journal/.env.example).

## Deployment Notes

Vercel deployment target is Postgres-backed Prisma.

Expected setup:

- connect a Postgres provider to the Vercel project through Marketplace
- let Vercel inject `DATABASE_URL`
- run Prisma schema changes against that database
- app data, node context, and prompt versions all persist through Prisma/Postgres

Build entry:

- `npm run vercel-build`

Smoke test:

- `npm run smoke:deploy`

## Auth

Auth is optional and uses Auth.js / NextAuth with Google.

When `AUTH_ENABLED=false`:

- no redirect to sign-in
- no session gating
- conversations are effectively public within the local/demo app

When `AUTH_ENABLED=true`, configure the Google OAuth variables in `.env.local` and Vercel.
