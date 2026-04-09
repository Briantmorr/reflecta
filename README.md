# Mirror — A Guided Tour of the Psyche

Mirror is an interactive web application that helps users explore their inner world through conversation and visualization.

Instead of traditional journaling, Mirror acts as a reflective companion. It uses a large language model (LLM) to guide users through meaningful questions about their life—family, relationships, work, and personal concerns—while dynamically constructing a living “map of the self.”

This map is represented as a graph, where:
- The user is the central node
- Key domains (family, work, relationships, identity) branch outward
- Specific entities (people, roles, experiences) expand those domains

As conversations evolve, the graph grows. As the graph grows, the conversation deepens.

---

## Core Concepts

### 1. Conversational Exploration
Users engage in a guided dialogue with an LLM. The system asks reflective, structured questions while allowing free-form input.

### 2. Dynamic Psyche Graph
User responses are parsed and mapped into a graph structure:
- Nodes = entities (person, role, concept)
- Edges = relationships (works with, child of, stress from, etc.)

### 3. Feedback Loop
The LLM:
1. Interprets user input
2. Updates the graph
3. Retrieves relevant context from the graph
4. Generates deeper follow-up questions

---

## Entry Point (Onboarding Flow)

On first use, Mirror initializes the graph using 3–5 seed questions:

- “Can you tell me about your family?”
- “What does your current work look like?”
- “Who are the most important people in your life right now?”
- “What has been on your mind lately?”
- “What is currently causing you stress or excitement?”

These responses populate the initial graph structure.

---

## Features (V1)

- Conversational interface (LLM-led dialogue)
- Dynamic graph visualization of user life domains
- Persistent conversation storage
- Conversation history explorer (left panel)
- Context-aware follow-up questioning
- Real-time graph updates from conversation

---

## Future Directions

- Aggregated insights across time
- “Value map” and “anti-value map”
- Emotional trend tracking
- Exportable psyche reports
- Memory weighting / importance scoring

---

## Setup Instructions

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values (see below for what each is for)
cp .env.example .env.local
cp .env.example .env   # Prisma CLI reads .env, Next reads .env.local

# 3. Create the SQLite schema and seed the demo data
npm run db:push
npm run db:seed

# 4. Run the dev server
npm run dev
```

By default `AUTH_ENABLED=false` and no external services are required —
the app runs locally with a mock LLM, a SQLite DB, and no sign-in gate.

### Optional: turn on Google sign-in

1. Create OAuth credentials in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
    - Authorized JS origin: `http://localhost:3000`
    - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
2. Generate an `AUTH_SECRET`: `openssl rand -base64 32`
3. In `.env.local` set:
    - `AUTH_ENABLED="true"`
    - `AUTH_SECRET="…"`
    - `GOOGLE_CLIENT_ID="…"`
    - `GOOGLE_CLIENT_SECRET="…"`
4. Restart `npm run dev`. You should be bounced to `/signin` on first load.

When the flag is off, the app behaves exactly as it does today — no
redirect, no session lookups, conversations belong to nobody.

---

## Deployment (Vercel)

Mirror deploys to Vercel from the `develop` branch. Every push to
`develop` produces a new deploy viewable by anyone with the preview URL.

> ⚠️ SQLite on Vercel is read-only and ephemeral. We work around it by
> seeding `prisma/dev.db` at build time, bundling it with the function
> via `outputFileTracingIncludes`, and copying it to `/tmp/dev.db` on
> cold start (see `src/lib/db.ts`). Writes survive within a single
> warm function instance but disappear between cold starts. This is
> fine for UI previews — not for real users. Migrate to Postgres
> (Neon) before onboarding anyone who needs their data to stick.

### One-time setup

1. Push this repo to GitHub (see [Creating the GitHub repo](#creating-the-github-repo) below).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. In the import screen:
    - **Framework preset:** Next.js (auto-detected).
    - **Build command:** leave as default — Vercel will auto-detect the
      `vercel-build` script in `package.json` which runs the seed.
    - **Environment variables:**
        - `DATABASE_URL` = `file:./dev.db`   _(build-time only; runtime overrides this to `/tmp/dev.db`)_
        - `AUTH_ENABLED` = `false`           _(leave off until we migrate to Postgres)_
4. After the first deploy lands, open **Project → Settings → Git** and
   change the **Production Branch** from `main` (or whatever the initial
   default was) to `develop`.

### Day-to-day

- Merge anything you want your partner to see into `develop`.
- Vercel auto-builds and auto-deploys.
- Grab the deploy URL from the Vercel dashboard and share it.

### Creating the GitHub repo

```bash
gh repo create mirror --private --source=. --remote=origin --push
git checkout -b develop
git push -u origin develop
```

---

## Tech Stack (Summary)

- Frontend: React / Next.js
- Editor/Interaction: Chat-based UI
- Graph Visualization: (e.g., D3.js / React Flow)
- Backend: API routes (Next.js or separate service)
- Database:
  - SQLite (conversation storage)
  - (Future: Postgres for scale)
- LLM: OpenAI GPT-5.4

---

## Philosophy

Mirror is not just a journaling tool.

It is an evolving system that helps users:
- See themselves more clearly
- Understand patterns across their life
- Ask better questions about who they are

The goal is not just reflection—but structured self-understanding.