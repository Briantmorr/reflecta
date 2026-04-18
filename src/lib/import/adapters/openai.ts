import crypto from 'node:crypto'
import path from 'node:path'
import type { Adapter, ImportedMessage } from '../types'
import { deriveImportedTitle } from '../titles'

type RawOpenAIMessage = {
  role?: unknown
  content?: unknown
}

type TextPart = {
  type?: unknown
  text?: unknown
}

export const openAIAdapter: Adapter = (rawBytes, filename) => {
  const sourceRef = crypto.createHash('sha256').update(rawBytes).digest('hex')
  const parsed = JSON.parse(rawBytes.toString('utf8')) as { messages?: unknown }

  if (!Array.isArray(parsed.messages)) {
    throw new Error('Expected a top-level messages array')
  }

  const messages: ImportedMessage[] = []

  for (const [index, rawMessage] of parsed.messages.entries()) {
    const message = rawMessage as RawOpenAIMessage
    if (message.role === 'system') continue
    if (message.role !== 'user' && message.role !== 'assistant') {
      console.warn(`[WARN] ${filename}: dropping message ${index} with unknown role`)
      continue
    }

    const content = normalizeContent(message.content)
    if (!content) continue
    messages.push({ role: message.role, content })
  }

  if (messages.length === 0) {
    throw new Error('No importable user or assistant messages found')
  }

  return {
    sourceRef,
    sourceType: 'openai_json',
    sourceName: path.basename(filename),
    title: deriveImportedTitle(filename, messages),
    messages,
  }
}

function normalizeContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        const textPart = part as TextPart
        return typeof textPart.text === 'string' ? textPart.text : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()
  }

  return ''
}
