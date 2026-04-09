/** Smart date formatting: "Today · 2:30 PM", "Yesterday · 9:14 AM", or "Apr 8, 2026" */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today.getTime() - 86_400_000)
  const entryDay = startOfDay(date)

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (entryDay.getTime() === today.getTime()) return `Today · ${timeStr}`
  if (entryDay.getTime() === yesterday.getTime()) return `Yesterday · ${timeStr}`
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Derive a title from the first user message in a conversation */
export function deriveConversationTitle(firstMessage: string): string {
  const trimmed = firstMessage.trim()
  if (!trimmed) return 'Untitled Conversation'
  const firstSentence = trimmed.split(/[.!?\n]/)[0]?.trim() ?? trimmed
  return firstSentence.length > 50 ? firstSentence.slice(0, 50) + '…' : firstSentence
}

/** Normalize an entity label so "Dad" / "dad" / "father" all collapse to one node */
export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Title-case a normalized label for display */
export function displayLabel(label: string): string {
  return label
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
