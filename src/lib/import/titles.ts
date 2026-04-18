import path from 'node:path'
import { deriveConversationTitle } from '@/lib/utils'
import type { ImportedMessage } from './types'

export function deriveImportedTitle(filename: string, messages: ImportedMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')?.content
  if (!firstUserMessage) return titleCaseStem(filename)

  const descriptiveLine = firstUserMessage
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length >= 40)

  return deriveConversationTitle(descriptiveLine ?? firstUserMessage)
}

function titleCaseStem(filename: string) {
  const stem = path.basename(filename, path.extname(filename)).replace(/_/g, ' ').trim()
  const title = stem.replace(/\b\w/g, (letter) => letter.toUpperCase())
  return title.length > 80 ? `${title.slice(0, 79)}…` : title
}
