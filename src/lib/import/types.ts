export type ImportedMessage = { role: 'user' | 'assistant'; content: string }

export type ImportedConversation = {
  sourceRef: string
  sourceType: 'openai_json' | 'journal_text'
  sourceName: string
  title: string
  messages: ImportedMessage[]
  importedAt: Date
  createdAt: Date
}

export type Adapter = (
  rawBytes: Buffer,
  filename: string
) => Omit<ImportedConversation, 'importedAt' | 'createdAt'>
