/**
 * Strip HTML tags and return first meaningful line as a title preview.
 * Caps at 60 chars with ellipsis.
 */
export function getEntryTitle(htmlContent: string): string {
  const text = htmlContent
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const firstLine = text.split(/[.\n]/)[0]?.trim() ?? ''
  if (!firstLine) return 'Untitled Entry'
  return firstLine.length > 60 ? firstLine.slice(0, 60) + '…' : firstLine
}

/**
 * Smart date formatting: "Today · 2:30 PM", "Yesterday · 9:14 AM", or "Apr 8, 2026"
 */
export function formatEntryDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = new Date(today.getTime() - 86_400_000)
  const entryDay = startOfDay(date)

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  if (entryDay.getTime() === today.getTime()) {
    return `Today · ${timeStr}`
  }
  if (entryDay.getTime() === yesterday.getTime()) {
    return `Yesterday · ${timeStr}`
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Count words in a plain text or HTML string */
export function wordCount(text: string): number {
  const plain = text.replace(/<[^>]*>/g, ' ').trim()
  if (!plain) return 0
  return plain.split(/\s+/).filter(Boolean).length
}
