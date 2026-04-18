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

# Apply schema changes to the committed Vercel/demo snapshot DB
npm run db:push:snapshot

# Import seed_conversations/ into prisma/dev.db
npm run import:conversations

# Re-import from scratch, replacing prior imported conversations
npm run import:conversations -- --force
```

By default:

- local auth is off
- SQLite is used
- local dev reads `DATABASE_URL`, normally `file:./dev.db`
- Vercel/demo deploys ship the committed snapshot at `prisma/dev.db`
- if `OPENAI_API_KEY` is missing, the app falls back to the mock LLM

If you change the Prisma schema and already have a local `dev.db`, run `npm run db:push` before restarting `npm run dev`. This preserves local conversations while adding nullable columns/indexes. To preview the committed import snapshot locally, start dev with `DATABASE_URL=file:./prisma/dev.db npm run dev` or temporarily point `.env` at `file:./prisma/dev.db`.

## Prompt Editing

Prompts live in `prompts/` as JSON files so you can iterate on tone and behavior without touching app code:

| File | Controls |
|------|----------|
| `mirror_persona.json` | Mirror's identity and voice — prepended to every LLM call |
| `conversation-turn.json` | Per-message reflective replies and entity extraction |
| `conversation-tagger.json` | Post-conversation tagging (the "Update map" step) |

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

## Environment

Main vars:

- `OPENAI_API_KEY`: enables real GPT-5.4 responses and tagging
- `DATABASE_URL`: local Prisma/SQLite path, default is `file:./dev.db`
- `AUTH_ENABLED`: turns sign-in on or off
- `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: required only when auth is enabled

See [.env.example](/Users/brianmorris/dev/projects/llm_journal/.env.example).

## Deployment Notes

Vercel currently uses bundled SQLite for preview/demo environments.

Current behavior:

- `prisma/dev.db` is committed as the deploy snapshot
- imports are run locally with `npm run import:conversations`
- runtime copies that bundled DB to `/tmp/dev.db`
- data is writable during runtime but still ephemeral across cold starts

That means Vercel deploys are useful for previewing the product, not for durable user storage.

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
