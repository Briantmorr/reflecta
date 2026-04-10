---
name: reflecta-deploy-check
description: Use when testing Reflecta or Mirror frontend changes against the deployed Vercel app or local dev app. Run the bundled smoke script, inspect the live page output, and verify critical UI entry points like starting a conversation, graph visibility, and node view indicators.
---

# Reflecta Deploy Check

Use this skill after shipping or changing frontend behavior that should be verified on the deployed app.

## Default targets

- Production-ish deploy: `https://reflecta-delta.vercel.app/`
- Local dev: `http://localhost:3000/`

## Workflow

1. Run `bash .codex/skills/reflecta-deploy-check/scripts/smoke.sh <url>`.
2. If the smoke check fails, inspect the failing route directly with `curl -i`.
3. For UI checks, open the deployed page with the web tool and confirm visible copy and controls match the expected state.
4. If the user reports a dead button or broken interaction, test the backing API route directly before changing UI code.

## What to verify

- Home loads without a server error.
- Empty state shows `Select or start a conversation`.
- Empty state shows the `Start conversation` button.
- Graph pane loads and exposes `Psyche graph`.
- `GET /api/graph` returns JSON.
- `GET /api/conversations` returns a non-500 response.
- `POST /api/conversations` returns `201` when the app should allow public conversation creation.

## Notes

- A clickable UI control can still be broken if its backing API route returns `500`.
- For this repo, pay special attention to SQLite path mismatches between build-time and Vercel runtime.
- If the smoke script passes but the user still reports a visual problem, use the web tool to inspect the rendered page text.
