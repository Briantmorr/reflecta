import path from 'node:path'
import { openAIAdapter } from './adapters/openai'
import { journalTextAdapter } from './adapters/journalText'
import type { Adapter } from './types'

const ADAPTERS: Record<string, Adapter> = {
  '.json': openAIAdapter,
  '.txt': journalTextAdapter,
  '.md': journalTextAdapter,
}

export function getImportAdapter(filename: string) {
  return ADAPTERS[path.extname(filename).toLowerCase()] ?? null
}

export type { ImportedConversation, ImportedMessage } from './types'
