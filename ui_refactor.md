# UI Refactor — Scribbled Notebook view

## Context

A Claude-Design handoff (`/tmp/mirror-handoff/mirror/`) ships four journal-style design directions for Mirror; this refactor implements only the **2nd direction — Scribbled Notebook** (`mirror-journal.jsx → NotebookArt`).

The look: a single off-axis cream notebook page with three-hole-punch dots, a top header rule + red margin tab, a hand-inked SVG graph (You at center, 6 domains in a honeycomb, children radiating), a yellow sticky-note composer pinned top-right, and — when a node is selected — a paperclipped slip on the right showing "What I remember" + "Pattern" + "Entries tagged".

## Decisions

- **Placement:** Replace main `/` route with the Notebook. Existing 3-pane app (ChatInterface + PsycheGraph + ConversationList) moves to `/chat`.
- **Composer:** Sticky-note send routes to `/chat?prefill=<text>` — Notebook stays read-mostly; chat does the actual writing.
- **Marginalia:** Skip the red handwritten side notes entirely for v1.

## Approach

Build the Notebook as a single page-level React component composed of small SVG primitives that mirror the handoff prototype. Wire it to **real** data from the existing `GET /api/graph` endpoint and conversation list — no mock module. Reuse the existing node-context / insights / conversations work that already lives behind `ConversationList.tsx`.

The handoff prototype renders into a fixed `1440×900` `DCArtboard`. We render the same logical viewport into a responsive SVG wrapper so it scales to the browser; layout math stays in the 1440×900 coordinate system (matches the prototype exactly).

## File-level changes

### 1. Route restructure

- **Move** `src/app/page.tsx` → `src/app/chat/page.tsx` (no code changes; fix any relative imports).
- **Create** `src/app/page.tsx` — new shell that renders `<NotebookView/>`.
- **Update** any internal links (settings menu, signin redirect) that point to `/` and assume the chat UI lives there. Search: `router.push('/')`, `redirect('/')`, `<Link href="/">` in `src/`.
- `src/app/chat/page.tsx` reads `?prefill=` from `useSearchParams` and seeds its initial chat textarea.

### 2. Fonts (in `src/app/layout.tsx`)

Add via `next/font/google`:
- `Fraunces` (weights 300/400/500/600 + italic 300/400/500) → CSS var `--font-fraunces`
- `JetBrains_Mono` (400/500) → CSS var `--font-mono`
- Keep existing `Inter` → `--font-inter`

The design references `var(--serif)` / `var(--sans)` / `var(--mono)` — define these in `globals.css` mapped to the next/font vars.

### 3. Notebook palette (in `src/app/globals.css`)

Scope to `.notebook-root`:

```
--ink: #1a140c; --ink-2: #2a2318; --ink-3: #6b5230; --ink-4: #8c7549;
--paper: #fbf5e4; --paper-2: #faf2dd; --paper-3: #f2e1b0;
--rule: #d6c7a0; --rule-soft: #e8dcb7;
--accent: #7a4a1e; --accent-red: #a23b1e; --accent-gold: #c4a76a;
--desk: #b4a684;
```

Body inside the notebook root sets `background: var(--desk)`.

### 4. New components — `src/components/notebook/`

| File | Source in handoff | Purpose |
|---|---|---|
| `NotebookView.tsx` | `NotebookArt()` lines 453-640 of `mirror-journal.jsx` | Top-level page: desk gradient, paper sheet, header, graph SVG, sticky note, slip. Owns selected-node state + graph fetch. |
| `PaperFilters.tsx` | `PaperFilters` in `mirror-journal.jsx` | SVG `<defs>` block: `pg-grain` (feTurbulence + feColorMatrix), `pg-fox` (foxing speckles), `pg-wobble` (feDisplacementMap for ink jitter). Render once near the root SVG. |
| `PaperSheet.tsx` | `PaperSheet` in `mirror-journal.jsx` | `<g>` with rect, dog-eared corner via `clipPath`, drop-shadow filter, `tint` fill. Children render inside. |
| `InkLine.tsx` | `InkLine` in `mirror-journal.jsx` | `<line>` with `filter="url(#pg-wobble)"` for hand-drawn jitter. |
| `InkNode.tsx` | `InkNode` (declared in `mirror-journal.jsx`, ref `mirror-shared.jsx`) | Circle + icon glyph + label. Fill black if `you`; outlined ring for domains; small dot for persons; dashed ring if dormant. Click selects. |
| `StickyNote.tsx` | sticky-note JSX inside `NotebookArt` | Top-right yellow note (rotate 2.5°, tape strip, "NOTE TO SELF" mono caps, italic Fraunces prompt, textarea, "send →" pill). On send → `router.push('/chat?prefill=' + encodeURIComponent(text))`. |
| `NotebookSlip.tsx` | `NotebookSlip` in `mirror-journal.jsx` | Right-side paperclipped card visible when a node is selected. Sections: "About · {LABEL}" (mono caps), big italic Fraunces label, "{n} reflection · last noted today" line, "Pattern" + insights summary in italic, "What I remember" bullet list (from `node.context.text`), "Entries tagged" (conversations whose tags include the node label). Close button. |
| `icons.tsx` | `MIcon` + `iconForNode` in `mirror-shared.jsx` | Inline SVG glyphs (self / health / work / relationships / hobbies / lifestyle / person / group / send). Don't pull from `lucide-react` — the design's editorial line weight + viewBox geometry doesn't match. |
| `layout.ts` | `journalLayout` in `mirror-journal.jsx` | Pure function: input `(W, H, options)` + node list, output `Map<id, {x, y}>`. You at center, 6 domains in fixed honeycomb angles, children placed by recursive radial subdivision. Hardcoded for the 6 expected domain ids (`self`, `health`, `work`, `relationships`, `hobbies`, `lifestyle`); falls back to even ring if a graph has different domains. |

### 5. Header / chrome inside `NotebookView`

- Vertical "MIRROR — vol. I" rotated -90° on the left edge (mono caps, `--ink-4`).
- Top heading band: `"<Weekday>. <DD> <Month> · <time-of-day>"` (mono small caps), then big italic Fraunces 30px `"A map of your life, drawn from memory."`. Time-of-day = "morning" / "afternoon" / "evening" derived from `new Date()`. Drop the "partly rain" weather (no source).
- `entry no. {N}` mono caps top-right inside the page (N = total conversations from `/api/conversations`).
- Three holes left at 18%/50%/82%; faint full-page rules every 44px; red margin only top (x=112, y1=40 → y2=180); vertical red dashed mirror axis through center.
- Legend bottom-left: `◉ you · ○ theme · · person · ◌ dormant`.
- Page number "— {N+42} —" bottom-right (matches design's "85").

### 6. Data wiring

Use existing endpoints — no new APIs:
- `GET /api/graph` → `Graph { nodes, edges }`. Already includes `context`, `insights`, `dormant`, `mentionCount`.
- `GET /api/conversations` → list with `tags` for "Entries tagged".

`NotebookView` is a client component that fetches both on mount, holds `selectedNodeId` state, and renders `<NotebookSlip>` only when set.

**Type mapping (real → design):**
- `GraphNode.type === 'user'` → render as filled black "you" node.
- `'domain'` → outlined ring, domain icon by `label`.
- `'person'` → small "person" InkNode.
- `'role'`, `'emotion'` → render as `person` style for v1.

`NodeContext.text` is plain text — split it on `\n` (or sentence boundaries fallback) into bullet items for the slip's "What I remember" list. The existing distillation prompt already produces 2-5 bullets, so split on `\n` should suffice.

### 7. Layout math (`layout.ts`)

Port `journalLayout(W, H, opts)` from `mirror-journal.jsx`:
- `you` at `(W * cxFrac, H * cyFrac)` — defaults `cxFrac=0.5, cyFrac=0.55`.
- 6 domains at fixed honeycomb angles `[210°, 270°, 330°, 30°, 90°, 150°]` mapped by id (Lifestyle/Hobbies left-down, Self up, Work/Coworkers right, Relationships down).
- Children laid out at radial offsets from their parent, subdivided so siblings spread without overlap. Use the recursive helper from the prototype.

### 8. globals.css cleanup

The existing `globals.css` has React Flow overrides + `psyche-*` animations only used by the chat route. Don't delete them — they're still used at `/chat`. Wrap notebook tokens under `.notebook-root` so the two visual systems don't collide.

## Critical files to modify

- `src/app/layout.tsx` — fonts.
- `src/app/page.tsx` — replaced (becomes Notebook shell).
- `src/app/chat/page.tsx` — new home for old `page.tsx`.
- `src/app/globals.css` — notebook palette block.
- `src/components/notebook/*` — all new files (8).
- `src/app/signin/page.tsx` — verify post-signin redirect target.

## Out of scope (explicit non-goals)

- Marginalia text (skipped per user).
- Real-time streaming inside the sticky note (just routes away).
- Replacing/removing the `/chat` 3-pane experience.
- New API endpoints or schema changes — Notebook reads what's there.
- Touch / mobile-first layout polish — the design is 1440×900 first; we keep that ratio and scale uniformly. Phone polish is a follow-up.

## Verification

1. `npm run typecheck` clean.
2. `npm run dev`, sign in, land on `/`. Notebook renders: cream paper, three holes, header, hand-inked graph with 6 domains around You, paperclipped slip closed, sticky note composer top-right, page number/legend in place.
3. Click a domain node (e.g., Relationships) → slip slides in showing label, insights summary as the italic "Pattern" quote, context bullets, conversations tagged with `relationships` (or its label).
4. Type into sticky note, click send → navigates to `/chat?prefill=...`, the chat textarea is pre-populated.
5. Navigate directly to `/chat` → existing 3-pane app still works (graph + list + chat). Selecting nodes there still shows insights + context (regression check on the unrelated route).
6. Resize browser → SVG scales but layout stays correct (no overlap, dog-ear still present).
7. Visual sanity: compare against the reference screenshot — paper tone, font weights, dog-ear angle, sticky-note tape strip, slip paperclip should all match.

## Risks / open questions

- The handoff lays out exactly 6 domains with hardcoded labels. The live DB may have different domain count or naming — fallback ring layout handles count; label mismatch means an icon fallback (`'self'`).
- Domain icons are hand-drawn editorial SVGs — porting all 9 (`self/health/work/relationships/hobbies/lifestyle/person/group/send`) is mechanical but tedious. Will copy paths verbatim from `mirror-shared.jsx`.
- "Entries tagged" depends on `Conversation.tags[]` containing the node label. Confirm tags in the existing schema match node labels case-insensitively.
