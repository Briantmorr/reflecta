export interface JournalEntry {
  id: string
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
  questions?: EntryQuestion[]
}

export interface EntryQuestion {
  id: string
  text: string
  entryId: string
  createdAt: string
}

// Minimal shape returned by the list endpoint (no content)
export interface EntryListItem {
  id: string
  title: string | null
  createdAt: string
  updatedAt: string
}
