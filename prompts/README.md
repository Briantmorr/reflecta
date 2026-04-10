# Prompt Files

Editable LLM prompts for Mirror. Edit these to tune tone, behavior, and extraction rules without touching app code.

| File | Purpose |
|------|---------|
| `conversation-turn.json` | Per-message reflective replies and entity extraction |
| `conversation-tagger.json` | Post-conversation tagging ("Update map") |
| `onboarding.json` | First message in a new conversation |

Each file has one field: `{ "prompt": "..." }`

In dev, edits reload on every request. In production, prompts are cached after first read. Missing or malformed files fall back to defaults in `src/lib/llm.ts`.

See the main [README](../README.md#prompt-editing) for tuning tips.
