import crypto from 'node:crypto'
import path from 'node:path'
import type { Adapter } from '../types'
import { deriveImportedTitle } from '../titles'

export const journalTextAdapter: Adapter = (rawBytes, filename) => {
  const content = rawBytes.toString('utf8').trim()
  if (!content) {
    throw new Error('Journal file is empty')
  }

  const messages = [{ role: 'user' as const, content }]

  return {
    sourceRef: crypto.createHash('sha256').update(rawBytes).digest('hex'),
    sourceType: 'journal_text',
    sourceName: path.basename(filename),
    title: deriveImportedTitle(filename, messages),
    messages,
  }
}
