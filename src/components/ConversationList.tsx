'use client'

import { useState } from 'react'
import { MessageSquarePlus, Trash2, Sparkles } from 'lucide-react'
import { ConversationListItem } from '@/types'
import { formatDate } from '@/lib/utils'

interface ConversationListProps {
  conversations: ConversationListItem[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirmDeleteId === id) {
      onDelete(id)
      setConfirmDeleteId(null)
    } else {
      setConfirmDeleteId(id)
      setTimeout(() => setConfirmDeleteId(null), 3000)
    }
  }

  return (
    <aside
      className="flex flex-col h-screen overflow-hidden select-none"
      style={{
        width: '260px',
        flexShrink: 0,
        background: 'var(--mirror-nav)',
        borderRight: '1px solid var(--mirror-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4"
        style={{ borderBottom: '1px solid var(--mirror-border)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={15} style={{ color: 'var(--mirror-accent)' }} />
          <span
            className="text-sm font-semibold tracking-widest uppercase"
            style={{ color: 'var(--mirror-text)' }}
          >
            Mirror
          </span>
        </div>
        <button
          onClick={onCreate}
          title="New Conversation"
          className="flex items-center justify-center rounded-md transition-colors"
          style={{
            width: '28px',
            height: '28px',
            color: 'var(--mirror-secondary)',
            background: 'transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--mirror-elevated)'
            e.currentTarget.style.color = 'var(--mirror-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--mirror-secondary)'
          }}
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>

      {/* Conversations list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center gap-3">
            <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              No conversations yet.
              <br />
              <button
                onClick={onCreate}
                className="underline underline-offset-2 mt-1 transition-colors"
                style={{ color: 'var(--mirror-accent)' }}
              >
                Start one
              </button>
            </p>
          </div>
        ) : (
          <ul className="px-2 space-y-0.5">
            {conversations.map((c) => {
              const isActive = c.id === activeConversationId
              const isHovered = c.id === hoveredId
              const isConfirming = c.id === confirmDeleteId

              return (
                <li key={c.id}>
                  <button
                    onClick={() => onSelect(c.id)}
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className="w-full text-left rounded-lg px-3 py-2.5 transition-colors relative"
                    style={{
                      background: isActive
                        ? 'var(--mirror-accent-dim)'
                        : isHovered
                        ? 'var(--mirror-elevated)'
                        : 'transparent',
                    }}
                  >
                    <span
                      className="block text-xs font-medium leading-snug truncate pr-5"
                      style={{
                        color: isActive ? 'var(--mirror-accent)' : 'var(--mirror-text)',
                      }}
                    >
                      {c.title ?? 'New Conversation'}
                    </span>
                    <span
                      className="flex items-center gap-1.5 text-xs mt-0.5 truncate"
                      style={{ color: 'var(--mirror-muted)' }}
                    >
                      <span>{formatDate(c.updatedAt)}</span>
                      {c.messageCount !== undefined && c.messageCount > 0 && (
                        <>
                          <span>·</span>
                          <span>
                            {c.messageCount} {c.messageCount === 1 ? 'msg' : 'msgs'}
                          </span>
                        </>
                      )}
                    </span>

                    {(isHovered || isActive) && (
                      <button
                        onClick={(e) => handleDeleteClick(e, c.id)}
                        title={isConfirming ? 'Click again to confirm' : 'Delete'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center rounded transition-colors"
                        style={{
                          width: '20px',
                          height: '20px',
                          color: isConfirming ? '#f87171' : 'var(--mirror-muted)',
                          background: isConfirming ? 'rgba(248,113,113,0.1)' : 'transparent',
                        }}
                        onMouseEnter={(e) => {
                          if (!isConfirming) e.currentTarget.style.color = '#f87171'
                        }}
                        onMouseLeave={(e) => {
                          if (!isConfirming) e.currentTarget.style.color = 'var(--mirror-muted)'
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
        style={{ borderTop: '1px solid var(--mirror-border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
          {conversations.length}{' '}
          {conversations.length === 1 ? 'conversation' : 'conversations'}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            background: 'var(--mirror-accent-dim)',
            color: 'var(--mirror-accent)',
            fontSize: '9px',
            letterSpacing: '0.05em',
            fontWeight: 600,
          }}
          title="Running with mock LLM — no API calls"
        >
          MOCK
        </span>
      </div>
    </aside>
  )
}
