# Conversation Import Spec

Import folders of user conversations and journal entries, run Mirror's existing conversation tagger on each item, and surface imported content identically to in-app conversations.

The import target is the configured Postgres database behind `DATABASE_URL`. There is no committed database snapshot.

## Goals

- Bulk-ingest local folders of conversations, journals, and notes.
- Reuse the same Mirror tagger path as live chat so imported content produces normal graph nodes and conversation tags.
- Display imported artifacts in history and node view identically to in-app conversations.
- Make imports idempotent through content hashes.
- Keep import as an explicit local/operator action, not a build step.

## Non-Goals

- In-app upload UI.
- Cross-file semantic deduplication.
- Editing imported messages in the UI.
- Importing binary attachments, images, or audio.
- Shipping seeded data by committing database files.

## Decisions

1. **Database target**: import writes to the active Prisma/Postgres database selected by `DATABASE_URL`.
2. **Idempotence**: `Conversation.sourceRef` is the sha256 hash of raw file bytes and is unique.
3. **Force behavior**: `--force` deletes prior imported conversations only, then re-imports and re-tags.
4. **Author identity hint**: import prepends a short hint to the transcript passed to the tagger, not to the permanent tagger prompt.
5. **Faith / spiritual content**: tag under `Self` with role/theme nodes like `Faith`, `Prayer`, and `Church`; do not add a new tier-one domain.
6. **Religious name stopwords**: `jesus`, `god`, `christ`, `lord`, `holy`, and `spirit` are person-name stopwords.

## Supported Input Formats

### OpenAI-Style JSON

```json
{ "messages": [ { "role": "user", "content": "..." } ] }
```

- `user` and `assistant` messages are imported.
- `system` messages are dropped.
- String content is used directly.
- Array content is flattened by joining text parts.
- Unknown roles are skipped with a warning.

### Plain Text / Markdown

- `.txt` and `.md` files become one-message conversations.
- The whole file is stored as a single `user` message.
- No synthetic assistant reply is created.

## Schema

Imported conversations use nullable metadata on `Conversation`:

```prisma
sourceRef  String?  @unique
sourceType String?
sourceName String?
importedAt DateTime?
```

These fields stay null for normal in-app conversations.

## Pipeline

Implemented in `scripts/import.ts`.

1. Parse args: `--dir <path>` defaults to `seed_conversations`; `--force` is optional.
2. Warn if `OPENAI_API_KEY` is absent; mock tagging may be used in local dev.
3. If `--force`, delete conversations where `sourceRef IS NOT NULL`.
4. Discover non-hidden `.json`, `.txt`, and `.md` files.
5. Sort files by filename for deterministic order.
6. For each file, compute `sourceRef = sha256(raw bytes)`.
7. Skip if a conversation with that `sourceRef` already exists.
8. Parse through the format adapter.
9. Create the `Conversation` and `Message` rows.
10. Load current graph context.
11. Run `generateImportConversationTags`.
12. Apply tags via `applyConversationMap`.
13. Log imported, skipped, errored, and total graph-node counts.

Imports run sequentially to avoid graph-node upsert races.

## Tagger Import Path

`generateImportConversationTags` reuses the live conversation tagger with import-specific transcript shaping:

- Builds the same `User:` / `Mirror:` transcript shape as live tagging.
- Trims very long transcripts by keeping the beginning and end.
- Prepends the author-identity hint to the transcript body.
- Uses the same tagger prompt, result schema, sanitizer, and graph application path as live chat.

## Title Derivation

1. If there are no user messages, use the filename stem in title case.
2. Otherwise, use the first substantial user line when possible.
3. Fall back to the first user message.
4. Cap generated titles to the same short length as live conversations.

## Commands

```bash
npm run import:conversations
npm run import:conversations -- --dir some/other/folder
npm run import:conversations -- --force
```

Before importing, ensure the target database has the current schema:

```bash
npm run db:push
```

## Vercel / Production

Import is not part of `vercel-build`.

Production data flow:

- Vercel connects to a Postgres provider and injects `DATABASE_URL`.
- Schema changes are pushed/migrated to that database before deploy verification.
- Imported conversations are loaded into the same Postgres database when needed.
- Vercel builds do not create, reset, or ship local database files.

## Success Criteria

- All supported files in `seed_conversations/` import without parser errors.
- Each imported conversation receives durable tags consistent with the tagger prompt.
- Journal-style entries render as single-bubble conversations and appear in tagged node views.
- Re-running import without flags skips previously imported files.
- Running import with `--force` replaces prior imported conversations and re-tags them.
- Local and Vercel runtime both read imported data from the configured Postgres database.
