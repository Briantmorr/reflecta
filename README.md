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
```

By default:

- local auth is off
- SQLite is used
- if `OPENAI_API_KEY` is missing, the app falls back to the mock LLM

## Prompt Editing

Prompts live in root-level JSON files:

- [`prompts/conversation-turn.json`](/Users/brianmorris/dev/projects/llm_journal/prompts/conversation-turn.json)
- [`prompts/conversation-tagger.json`](/Users/brianmorris/dev/projects/llm_journal/prompts/conversation-tagger.json)
- [`prompts/onboarding.json`](/Users/brianmorris/dev/projects/llm_journal/prompts/onboarding.json)

Pattern:

```json
{
  "prompt": "Your prompt text here"
}
```

In development, prompt edits are loaded fresh from disk. In production, they are cached after first read. If a file is missing or malformed, the code falls back to a built-in default prompt in [`src/lib/llm.ts`](/Users/brianmorris/dev/projects/llm_journal/src/lib/llm.ts).

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

- build creates `prisma/dev.db` from schema only
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
