# Conversation Import — Spec

Import folders of user conversations and journal entries, run the existing Mirror conversation tagger on each, and surface them in the app identically to in-app conversations. Output: a seeded `prisma/dev.db` that is committed to the repo and shipped as-is to Vercel deployments.

## Goals

- Bulk-ingest a folder of user artifacts (conversations, journals, notes).
- Reuse the existing Mirror tagger so imported content produces the same durable graph nodes as live chat.
- Display imported artifacts in conversation history and node view identically to in-app conversations.
- Produce a committed SQLite snapshot so Vercel deploys need zero OpenAI calls at build or runtime.

## Non-goals (V1)

- In-app upload UI.
- Cross-file deduplication or semantic merging.
- Editing imported messages in the UI.
- Importing binary attachments, images, or audio.

---

## Decisions (resolved)

1. **Malformed `thread_1.json`** — already fixed by hand; valid JSON with 7 messages.
2. **Faith / spiritual content** — tags under `Self` with role nodes like `Faith`, `Prayer`, `Church`. No new tier-one domain. Already reflected in `prompts/conversation-tagger.json`.
3. **Religious figures as people** — add `jesus`, `god`, `christ`, `lord`, `holy`, `spirit` to `PERSON_NAME_STOPWORDS` in `src/lib/llm.ts`. Do **not** add `father` (conflicts with existing Dad/Fatherhood extraction).
4. **Author-identity hint** — prepended to the **transcript body** passed to the tagger, not injected into the tagger system prompt. Keeps the permanent prompt clean and makes the hint visible alongside the transcript.
5. **Idempotence** — `Conversation.sourceRef` is the sha256 of raw file bytes and is `@unique`. Same content = same hash = skip. Changed content = different hash = new row. `--force` wipes all prior imported rows (where `sourceRef IS NOT NULL`) before running.
6. **Snapshot mechanism** — commit `prisma/dev.db` to the repo. No separate snapshot fixture, no `SEED_FROM_SNAPSHOT` flag.

---

## Supported Input Formats

V1 accepts two shapes, detected by file extension. Adapters dispatch by extension.

### 1. OpenAI-style JSON (`*.json`)

```json
{ "messages": [ { "role": "user" | "assistant" | "system", "content": "..." }, ... ] }
```

- `system` messages dropped.
- `content` assumed to be a plain string. If it is an array of parts, concatenate the text parts in order with `\n\n` between them.
- Unknown roles dropped with a warning.

### 2. Plain-text journal (`*.txt`, `*.md`)

- Whole file becomes a single `user` message.
- No synthetic assistant reply.

### Adapter contract

```ts
// src/lib/import/types.ts
export type ImportedMessage = { role: 'user' | 'assistant'; content: string }

export type ImportedConversation = {
  sourceRef: string          // sha256 of raw file bytes
  sourceType: 'openai_json' | 'journal_text'
  sourceName: string         // original filename (no path)
  title: string
  messages: ImportedMessage[]
  importedAt: Date           // set by pipeline, not adapter
  createdAt: Date            // set by pipeline, not adapter
}

export type Adapter = (rawBytes: Buffer, filename: string) => Omit<
  ImportedConversation, 'importedAt' | 'createdAt'
>
```

Adapters live at `src/lib/import/adapters/openai.ts` and `src/lib/import/adapters/journalText.ts`. Dispatcher at `src/lib/import/index.ts`.

---

## Journal-Entry Handling

A journal entry becomes a `Conversation` with exactly one `user` `Message` and no assistant reply.

Required UI verification (do before implementation completes): open the existing `src/components/ChatInterface.tsx` and confirm it renders a conversation with zero assistant messages without crashing, empty-state glitches, or broken scrolling. If it does not, add a minimal guard. Do not add new UI affordances for journals — they render as a single user bubble followed by the normal composer.

Node view: journal entries appear in node-tagged conversation lists the same as any other conversation. No special case needed in `getConversationTags` or node-view components.

---

## Schema Changes

Edit `prisma/schema.prisma`, `Conversation` model. Add:

```prisma
sourceRef   String?   @unique   // sha256 of raw file bytes; null for in-app convos
sourceType  String?             // 'openai_json' | 'journal_text'; null for in-app
sourceName  String?             // original filename (no path); null for in-app
importedAt  DateTime?           // set at import time; null for in-app
```

All four fields are nullable so in-app conversations continue to work unchanged. `@unique` on `sourceRef` gives cheap idempotence and is the canonical lookup key.

After edits, run `npx prisma db push` to apply. No migration file required since the repo uses `db push`, not `migrate`.

---

## Pipeline

Implemented in `scripts/import.ts`. Executes sequentially (no parallelism) to keep `upsertNode` unique-label logic race-free.

1. **Parse args** — `--dir <path>` (default `seed_conversations`), `--force` (boolean).
2. **Check API key** — if `OPENAI_API_KEY` is absent, emit `[WARN] No OPENAI_API_KEY — imported convos will tag via mock LLM` once and continue.
3. **If `--force`** — delete all `Conversation` rows where `sourceRef IS NOT NULL`. Cascade deletes their messages, message-node refs, and conversation-node tags. Graph nodes/edges are left intact (they may still have legitimate refs from in-app conversations).
4. **Discover files** — list non-hidden files in `--dir`, filter by extension (`.json`, `.txt`, `.md`), sort by filename ascending for deterministic ordering.
5. **For each file, in order:**
   1. Read raw bytes. Compute `sourceRef = sha256(bytes)`.
   2. If a `Conversation` with this `sourceRef` already exists, log `[SKIP] <filename> (already imported)` and continue.
   3. Look up adapter by extension. Parse. On parse error log `[ERROR] <filename>: <message>` and continue.
   4. Compute `createdAt = new Date(Date.now() - (index * 86_400_000))` — files earlier in the sort land further in the past. Deterministic within a single run. Since the resulting DB is committed, dates are frozen after the one-time import.
   5. Create the `Conversation` row (with `sourceRef`, `sourceType`, `sourceName`, `importedAt`, `createdAt`, `title`).
   6. Create the `Message` rows in order, spacing their `createdAt` by 30 seconds starting from the conversation `createdAt`.
   7. Load the current graph via `getFullGraph()` from `src/lib/graph.ts`.
   8. Build the `Message[]` array (with `nodeRefs: []`) from persisted messages. Pass to the import tagger wrapper (see §Tagger Import Path).
   9. Apply results via `applyConversationMap(result, conversation.id)`.
   10. Log `[OK] <filename> → tags: [<label>, <label>, ...]`.
6. **Summary log** — imported count, skipped count, error count, total graph node count.

---

## Tagger Import Path

The existing `generateConversationTags` in `src/lib/llm.ts` stays unchanged for the live-chat path.

Add a new exported function in `src/lib/llm.ts`:

```ts
export async function generateImportConversationTags({
  conversationMessages,
  graph,
  maxTranscriptChars = 12_000,
}: {
  conversationMessages: Message[]
  graph: Graph
  maxTranscriptChars?: number
}): Promise<LLMResult>
```

Behavior (duplicates most of `generateConversationTags`, but applies import-specific transforms):

1. Build the transcript string exactly as `generateConversationTags` does (`User: ...` / `Mirror: ...` lines, `\n`-joined).
2. **Trim** — if `transcript.length > maxTranscriptChars`, keep the first 4,000 chars + `\n\n[...trimmed middle...]\n\n` + the last 6,000 chars. Otherwise leave as-is.
3. **Prepend author-identity hint** to the transcript (not the system prompt):
   ```
   (Note: the author of this transcript is the User. If a first name appears as the author's own name, do not tag it as a separate person node. Tag only other people the author discusses.)

   <transcript>
   ```
4. Send to OpenAI with the same schema and tagger system prompt as `generateConversationTags` (reuse `getTaggerPrompt()` and `RESULT_SCHEMA`). Fall back to `mockLLMCall(transcript)` when `OPENAI_API_KEY` is absent.
5. Return `sanitizeTagResult(parsed, transcript)` (reuse existing sanitizer).

Factor shared logic between `generateConversationTags` and `generateImportConversationTags` into a private helper if cleanliness requires it, but do not regress the existing live-chat path.

Also in `src/lib/llm.ts`: extend `PERSON_NAME_STOPWORDS` with `jesus`, `god`, `christ`, `lord`, `holy`, `spirit`. Do not add `father`.

---

## Runner

Add to `package.json` scripts:

```json
"import:conversations": "tsx scripts/import.ts"
```

Usage:

```
npm run import:conversations
npm run import:conversations -- --dir some/other/folder
npm run import:conversations -- --force
```

Arg parsing: hand-rolled against `process.argv.slice(2)`. Two flags only; no dependency added.

Not chained into `db:reset`. `db:reset` stays mock-only and deterministic. Import is the separate, opt-in, one-time step.

---

## Title Derivation

In `scripts/import.ts`, derive the `Conversation.title` as follows:

1. If the conversation has no user messages, use the filename stem with underscores replaced by spaces and Title Case applied. Cap at 80 chars.
2. Otherwise, take the first user message and split on newlines. Walk the resulting lines in order. Use the first line that is at least 40 characters long. Pass it through existing `deriveConversationTitle` (60-char cap).
3. If no line meets the 40-char threshold (short journals), fall back to `deriveConversationTitle(firstUserMessage)` directly.

Rationale: journals often open with salutations like `Dear Jesus,` — skipping short opening lines produces a title that actually describes the entry.

---

## Vercel Build

Current `vercel-build` script in `package.json`:

```
node -e "require('fs').rmSync('.next', { recursive: true, force: true })" && node -e "require('fs').rmSync('prisma/dev.db', { force: true })" && DATABASE_URL=file:./prisma/dev.db prisma generate && DATABASE_URL=file:./prisma/dev.db prisma db push --force-reset --accept-data-loss && next build
```

Change to:

```
node -e "require('fs').rmSync('.next', { recursive: true, force: true })" && DATABASE_URL=file:./prisma/dev.db prisma generate && next build
```

Two changes:
- Drop the `rmSync('prisma/dev.db')` step. The committed DB must survive the build.
- Drop `prisma db push --force-reset --accept-data-loss`. Force-reset would wipe the committed seed. Schema is already applied to the committed DB.

Also required:
- Remove `prisma/dev.db` from `.gitignore` if present. Verify before committing the DB.
- Commit `prisma/dev.db` after the local import completes. Size check: the DB should be comfortably small; if it exceeds ~5 MB, investigate before committing.

---

## Success Criteria

- All 9 files in `seed_conversations/` import cleanly (no parse errors, no tagger errors).
- Each imported conversation lands 2–6 durable tags consistent with the tagger prompt (no emotions, tier-one domains as anchors, named people preferred).
- Journal-style entries render as single-bubble conversations in the UI and appear under their tagged nodes in node view.
- Re-running `npm run import:conversations` with no flags is a no-op: `[SKIP]` for every file.
- Running with `--force` wipes prior imports and re-tags.
- The Vercel build succeeds without `OPENAI_API_KEY` and the deployed app shows imported conversations and their graph nodes.

---

## Implementation Order

1. **Schema** — edit `prisma/schema.prisma` to add `sourceRef`, `sourceType`, `sourceName`, `importedAt` on `Conversation`. Run `npx prisma db push`.
2. **Stopwords** — extend `PERSON_NAME_STOPWORDS` in `src/lib/llm.ts` per §Decisions.3.
3. **Import tagger** — add `generateImportConversationTags` in `src/lib/llm.ts` per §Tagger Import Path.
4. **Adapters** — create `src/lib/import/types.ts`, `src/lib/import/adapters/openai.ts`, `src/lib/import/adapters/journalText.ts`, `src/lib/import/index.ts` (dispatcher by extension).
5. **Orchestrator** — create `scripts/import.ts` implementing §Pipeline.
6. **npm script** — add `import:conversations` to `package.json`.
7. **Verify `ChatInterface`** — open `src/components/ChatInterface.tsx`, confirm it renders zero-assistant conversations cleanly; add a guard if it does not.
8. **Dry run** — run `npm run import:conversations` locally against `seed_conversations/` with a real `OPENAI_API_KEY`. Inspect tag quality. If a conversation produces filler-only or off-base tags, iterate on `prompts/conversation-tagger.json` and re-run with `--force`.
9. **Commit snapshot** — remove `prisma/dev.db` from `.gitignore` if present, commit `prisma/dev.db`.
10. **Update `vercel-build`** — replace the script per §Vercel Build.
11. **Smoke deploy** — push to Vercel, verify the deployed app shows all imported conversations and their graph nodes.
