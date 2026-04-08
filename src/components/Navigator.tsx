'use client'

import { useState } from 'react'
import { PenLine, Trash2, BookOpen } from 'lucide-react'
import { EntryListItem } from '@/types'
import { formatEntryDate } from '@/lib/utils'

interface NavigatorProps {
  entries: EntryListItem[]
  activeEntryId: string | null
  onSelectEntry: (id: string) => void
  onNewEntry: () => void
  onDeleteEntry: (id: string) => void
}

export default function Navigator({
  entries,
  activeEntryId,
  onSelectEntry,
  onNewEntry,
  onDeleteEntry,
}: NavigatorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      onDeleteEntry(id)
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
      // Auto-cancel after 3s
      setTimeout(() => setConfirmDeleteId(null), 3000)
    }
  }

  return (
    <aside
      className="flex flex-col h-screen overflow-hidden select-none"
      style={{
        width: '240px',
        flexShrink: 0,
        background: 'var(--journal-nav)',
        borderRight: '1px solid var(--journal-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid var(--journal-border)' }}
      >
        <div className="flex items-center gap-2">
          <BookOpen size={16} style={{ color: 'var(--journal-accent)' }} />
          <span
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: 'var(--journal-secondary)', letterSpacing: '0.08em' }}
          >
            Journal
          </span>
        </div>
        <button
          onClick={onNewEntry}
          title="New Entry (⌘N)"
          className="flex items-center justify-center rounded-md transition-colors"
          style={{
            width: '28px',
            height: '28px',
            color: 'var(--journal-secondary)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--journal-elevated)'
            e.currentTarget.style.color = 'var(--journal-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--journal-secondary)'
          }}
        >
          <PenLine size={15} />
        </button>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto py-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'var(--journal-elevated)' }}
            >
              <PenLine size={18} style={{ color: 'var(--journal-muted)' }} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--journal-muted)' }}>
              No entries yet.
              <br />
              <button
                onClick={onNewEntry}
                className="underline underline-offset-2 mt-1 transition-colors"
                style={{ color: 'var(--journal-accent)', textDecorationColor: 'var(--journal-accent-dim)' }}
              >
                Write your first entry
              </button>
            </p>
          </div>
        ) : (
          <ul className="px-2 space-y-0.5">
            {entries.map((entry) => {
              const isActive = entry.id === activeEntryId
              const isHovered = entry.id === hoveredId
              const isConfirming = entry.id === confirmDeleteId

              return (
                <li key={entry.id}>
                  <button
                    onClick={() => onSelectEntry(entry.id)}
                    onMouseEnter={() => setHoveredId(entry.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="w-full text-left rounded-lg px-3 py-2.5 transition-colors relative group"
                    style={{
                      background: isActive
                        ? 'var(--journal-accent-dim)'
                        : isHovered
                        ? 'var(--journal-elevated)'
                        : 'transparent',
                    }}
                  >
                    <span
                      className="block text-xs font-medium leading-snug truncate pr-5"
                      style={{
                        color: isActive ? 'var(--journal-accent)' : 'var(--journal-text)',
                      }}
                    >
                      {entry.title ?? 'Untitled Entry'}
                    </span>
                    <span
                      className="block text-xs mt-0.5 truncate"
                      style={{ color: 'var(--journal-muted)' }}
                    >
                      {formatEntryDate(entry.createdAt)}
                    </span>

                    {/* Delete button */}
                    {(isHovered || isActive) && (
                      <button
                        onClick={(e) => handleDeleteClick(e, entry.id)}
                        title={isConfirming ? 'Click again to confirm delete' : 'Delete entry'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded transition-colors"
                        style={{
                          width: '20px',
                          height: '20px',
                          color: isConfirming ? '#f87171' : 'var(--journal-muted)',
                          background: isConfirming ? 'rgba(248,113,113,0.1)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isConfirming)
                            e.currentTarget.style.color = '#f87171'
                        }}
                        onMouseLeave={(e) => {
                          if (!isConfirming)
                            e.currentTarget.style.color = 'var(--journal-muted)'
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--journal-border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--journal-muted)' }}>
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>
    </aside>
  )
}
