# Prompt Files

Editable LLM prompts for Mirror. Edit these to tune tone, behavior, and extraction rules without touching app code.

| File | Purpose |
|------|---------|
| `mirror_persona.json` | Mirror identity, voice, and map-building stance |
| `conversation-turn.json` | Per-message reflective replies and entity extraction |
| `conversation-tagger.json` | Post-conversation tagging ("Update map") |

Each file has one field: `{ "prompt": "..." }`

In dev, edits reload on every request. In production, prompts are cached after first read. Missing or malformed files fall back to defaults in `src/lib/llm.ts`.

Blank conversation starter questions are local UI copy, not LLM prompts.

See the main [README](../README.md#prompt-editing) for tuning tips.

### Updating these prompts
1) navigate to: https://github.com/Briantmorr/reflecta/blob/develop/prompts/conversation-turn.json
2) click the edit button (pencil icon)
3) after making a change, the commit changes button will be highlighted
4) after clicking that, you'll have a popup with some options. "commit directly to develop branch should be selected"
5) after you finish that popup and click commit, you should see new entry here: https://github.com/Briantmorr/reflecta/commits/develop/
