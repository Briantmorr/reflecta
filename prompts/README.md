# Prompt Files

Mirror keeps editable LLM prompts in this folder so prompt work can happen without touching app code.

Files:

- `conversation-turn.json`
- `conversation-tagger.json`
- `onboarding.json`

Pattern:

```json
{
  "prompt": "Your prompt text here"
}
```

Notes:

- The app reads these files from `src/lib/llm.ts`.
- In development, prompt edits are loaded fresh on each request.
- In production, prompts are cached in memory after first read.
- If a prompt file is missing or invalid JSON, the app falls back to a built-in default prompt.

Use this folder for prompt iteration. Keep app logic in `src/lib/llm.ts` and prompt copy here.
