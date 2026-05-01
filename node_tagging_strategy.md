# Node Tagging Strategy

The Mirror graph is a lean map of the user's life. Every node represents a load-bearing area — a person, role, group, or domain that genuinely shapes who they are. Every node must connect back to **You**. Floating nodes and noise labels (gerunds, pronouns, throwaway verbs) violate the design.

This document is the contract for how conversations turn into nodes.

## Pipeline

1. **Chat turn** — `POST /api/conversations/[id]/messages` streams a reply via `generateConversationTurnStream`. **No graph writes here.** The streaming pass is for conversation, not curation.
2. **End-of-conversation tagging** — `POST /api/conversations/[id]/tags` calls `generateConversationTags` (LLM, prompt at `src/lib/llm.ts` `DEFAULT_TAGGER_PROMPT`).
3. **Sanitize** — `sanitizeTagResult` runs the LLM output through:
   - drop emotions
   - `normalizeTagEntity` (alias rewrites)
   - `shouldRejectTagEntity` (shape predicate — see below)
   - `isSupportedByUserTranscript` (label must appear in user-authored text)
   - `enrichTagEntities` (deterministic backfill from regex heuristics)
   - re-run rejection + transcript checks
4. **Apply** — `applyConversationMap` (`src/lib/graph.ts`) plans nodes + edges in memory, validates connectivity to User, then commits only the connected subgraph.

## Invariants (enforced, not aspirational)

- **Connected.** Every committed node has a path to the User node through `has_domain` / `part_of` / `member_of`. If we can't place it, we don't keep it.
- **Sanitized at every entry point.** No node enters the DB without passing `shouldRejectTagEntity`. This includes nodes pulled in via relationship endpoints (`getOrCreateRelationshipNode`) — the backdoor is closed.
- **Shape-based rejection, not allow-list.** The rejection predicate uses regex/structural rules, not a fixed list of bad tokens. Adding stopwords one at a time never converges.
- **Tier-one domains are fixed.** Self, Health, Work, Relationships, Hobbies, Lifestyle. Nothing else becomes a tier-one.

## Rejection rules (`shouldRejectTagEntity`)

A label is rejected if any of:

- **Modifier-only** (curated): `new`, `newest`, `recent`, `latest`, `current`, `first`, `last`, `next`, `best`, `better`, `worse`, `more`, `most`, `less`, `favorite`, …
- **Stopword** (curated): pronouns/articles/filler/illustrative figures (`I`, `the`, `God`, `Jesus`, `Abraham`, `things`, `feelings`, `situation`, …).
- **Pronoun shape**: matches `/^(her|him|them|us|me|hers|his|theirs|ours|mine|himself|herself|themselves)$/`.
- **Gerund shape**: matches `/^[a-z]+ing$/` and is **not** in the hobby/practice allow-list (`running`, `writing`, `reading`, `parenting`, `coding`, `journaling`, `painting`, `drawing`, `cooking`, `climbing`, `cycling`, `hiking`, `dancing`, `singing`, `gardening`, `meditating`, `praying`, `lifting`, `boxing`, `surfing`, `skating`, `skateboarding`, `swimming`, `fishing`, `hunting`, `traveling`, `volunteering`).
- **Common verb form** (curated): `looks`, `looked`, `saying`, `said`, `going`, `went`, `doing`, `done`, `being`, `been`, `getting`, `got`, `having`, `had`, `working`, `worked`, `making`, `made`, `seeing`, `saw`, `feeling`, `felt`, `thinking`, `thought`, `knowing`, `knew`, …
- **Too long**: more than 4 words. A real node label is a noun phrase, not a sentence fragment.
- **Too short**: fewer than 2 characters.
- **Invalid domain**: a label tagged as `type: 'domain'` that isn't one of the six tier-one domains.

Rejection runs in **two places**:
1. `sanitizeTagResult` (before the LLM result is even shown to the graph layer).
2. `applyConversationMap` and `getOrCreateRelationshipNode` (defensive — the graph layer doesn't trust upstream callers).

## Connectivity enforcement

`applyConversationMap` doesn't write nodes one-by-one anymore. Instead:

1. Build a **plan**: for each surviving entity, derive its placement edge (`has_domain` for domains, `part_of` for roles via `inferTierOneDomain`, `member_of` for persons via `inferRoleContainer`, plus any LLM-supplied placement edges).
2. Compute reachability from the User node through the planned edges.
3. **Drop** any planned entity that isn't reachable. Log the dropped label + type so we can spot recurring LLM misfires.
4. Commit the surviving nodes and edges in a single pass.

If the entire plan collapses to zero, fall back to the conversation-title tag (existing behavior). Better to tag the whole conversation than to invent a floating node.

## Dedup

- Within one conversation: `dedupeEntities` keys on `(normalizedLabel, type)`.
- Across the graph: `upsertNode` looks up by normalized label; `canonicalGraphLabel` rewrites a small alias table (`helping → Service`, `marriageminded → Marriage Minded Dating`, …).
- Embedding-based fuzzy dedup is intentionally out of scope for now. If the same concept keeps splitting (e.g., `Mom` vs `Mother`), add to the alias table.

## Specificity over aggregation

The LLM's natural failure mode is to **over-summarize**: it sees "my dad called" and tags `Family` instead of `Dad`. Family is a useful container, but it's not the load-bearing node when the user is talking about a specific person.

Rules:

- **Named family roles always tag.** If the user transcript mentions `dad`, `mom`, `father`, `mother`, `brother`, `sister`, `partner`, `wife`, `husband` (and similar), the corresponding person node (`Dad`, `Mom`, …) must be in the result. The deterministic backfill in `enrichTagEntities` enforces this **unconditionally** — not gated behind `nonDomainCount < 2`. The LLM can drop the specific in favor of the container; we re-add it.
- **Container + person, not container instead of person.** When `Dad` is added, `Family` (the role container) and `Relationships` (the domain) are added too via placement, so the structure is `User → Relationships → Family → Dad`. Don't choose between them; keep all three.
- **Named coworkers always tag.** Same rule for coworkers extracted from the transcript: the named person plus the `Coworkers` container.
- **Hobbies activities always tag.** Concrete activities (Skateboarding, Pottery, Guitar) under Hobbies, not the abstract domain alone.

If the LLM returns only a generic container when a specific is supported by the transcript, treat that as a misfire and let the backfill correct it.

## What we don't do (yet)

- **Mention count + decay.** `mentionCount` is currently dead. Future: increment per tag, hide non-domain nodes with one mention older than N days, surface "candidate" nodes for manual review.
- **Embedding similarity.** Useful eventually, not needed to fix current symptoms.
- **Per-message graph writes.** The streaming pass stays read-only. End-of-conversation tagging is the only write path.
- **Schema-level placement requirement.** Could make the LLM JSON schema require placement edges for every entity; revisit if shape rules + connectivity check leave residual orphans.

## When to update this doc

- New rejection rule (shape, allow-list, alias).
- Change to the tier-one domain set (don't).
- New write path into the graph beyond the tagging endpoint.
- Change to the connectivity invariant.

If your change doesn't fit any of these, you probably don't need to touch this doc.
