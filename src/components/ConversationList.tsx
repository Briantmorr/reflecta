'use client'

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  Trash2,
  UserCircle,
  X,
} from 'lucide-react'
import { ConversationListItem, NodeView } from '@/types'
import { useSettings } from '@/lib/settings'
import { formatDate } from '@/lib/utils'

interface ConversationListProps {
  conversations: ConversationListItem[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  nodeView: NodeView | null
  onClearNodeView: () => void
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onDelete,
  nodeView,
  onClearNodeView,
}: ConversationListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [nodeConversationsOpen, setNodeConversationsOpen] = useState(false)
  const { openSettings } = useSettings()
  const selectedNodes = nodeView?.nodes ?? []
  const selectedNonUserNodes = selectedNodes.filter((node) => node.type !== 'user')
  const selectedLabel = selectedNodes.length > 0
    ? selectedNodes.map((node) => node.label).join(' + ')
    : 'You'
  const isAllConversationsView = selectedNonUserNodes.length === 0

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
      className="flex h-screen overflow-hidden select-none"
      style={{
        width: '280px',
        flexShrink: 0,
        background: 'var(--mirror-nav)',
        borderRight: '1px solid var(--mirror-border)',
      }}
    >
      <div className="flex h-full w-full flex-col">
        <div
          className="flex items-center justify-between px-4 py-4"
          style={{ borderBottom: '1px solid var(--mirror-border)' }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'var(--mirror-accent-subtle)' }}
            >
              <Sparkles size={15} style={{ color: 'var(--mirror-accent)' }} />
            </div>
            <div className="min-w-0">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: 'var(--mirror-secondary)' }}
              >
                Workspace
              </div>
              <div className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
                Node Summary
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={openSettings}
            title="Settings"
            aria-label="Open user settings"
            className="mirror-focus-ring flex h-8 w-8 items-center justify-center rounded-full transition-colors"
            style={{
              color: 'var(--mirror-secondary)',
              background: 'var(--mirror-elevated)',
            }}
          >
            <UserCircle size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {!nodeView && conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                No conversations yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3 px-3">
              <div
                className="rounded-[24px] border px-3 py-3"
                style={{
                  background: nodeView
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--mirror-accent) 16%, var(--mirror-surface)), var(--mirror-surface))'
                    : 'var(--mirror-surface)',
                  borderColor: nodeView ? 'var(--mirror-accent)' : 'var(--mirror-border)',
                  boxShadow: nodeView
                    ? '0 0 0 4px var(--mirror-accent-subtle), inset 0 1px 0 rgba(255,255,255,0.28)'
                    : 'none',
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: nodeView ? 'var(--mirror-accent-hover)' : 'var(--mirror-secondary)' }}
                    >
                      Selected node
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex max-w-full items-center rounded-full px-3 py-1.5 text-[12px] font-semibold"
                        style={{
                          background: nodeView
                            ? 'color-mix(in srgb, var(--mirror-accent) 18%, transparent)'
                            : 'var(--mirror-accent-subtle)',
                          color: 'var(--mirror-accent-hover)',
                          border: nodeView
                            ? '1px solid color-mix(in srgb, var(--mirror-accent) 34%, var(--mirror-border))'
                            : '1px solid var(--mirror-accent-dim)',
                          boxShadow: nodeView ? '0 8px 20px var(--mirror-accent-subtle)' : 'none',
                        }}
                      >
                        {selectedLabel}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
                        {isAllConversationsView ? 'All conversations' : 'Matching notes only'}
                      </span>
                    </div>
                  </div>
                  {nodeView && (
                    <button
                      type="button"
                      onClick={onClearNodeView}
                      className="mirror-focus-ring flex h-7 w-7 items-center justify-center rounded-full"
                      style={{
                        background: 'color-mix(in srgb, var(--mirror-accent) 12%, var(--mirror-surface))',
                        color: 'var(--mirror-accent-hover)',
                      }}
                      aria-label="Clear node summary"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <section className="space-y-2">
                <button
                  type="button"
                  onClick={() => setNodeConversationsOpen((open) => !open)}
                  className="mirror-focus-ring flex w-full items-center justify-between rounded-2xl border px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: 'color-mix(in srgb, var(--mirror-surface) 76%, transparent)',
                    borderColor: 'var(--mirror-border)',
                    color: 'var(--mirror-secondary)',
                  }}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                    Node conversations
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px]">
                    {conversations.length}
                    {nodeConversationsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  </span>
                </button>
                {nodeConversationsOpen && (
                  conversations.length === 0 ? (
                    <div
                      className="rounded-2xl border px-3 py-4 text-xs leading-relaxed"
                      style={{
                        background: 'var(--mirror-surface)',
                        borderColor: 'var(--mirror-border)',
                        color: 'var(--mirror-muted)',
                      }}
                    >
                      {isAllConversationsView
                        ? 'No conversations yet.'
                        : `No conversations are tagged with ${selectedLabel} yet.`}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                    {conversations.map((c) => {
                      const isActive = c.id === activeConversationId
                      const isHovered = c.id === hoveredId
                      const isConfirming = c.id === confirmDeleteId

                      return (
                        <li
                          key={c.id}
                          className="relative"
                          onMouseEnter={() => setHoveredId(c.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <button
                            type="button"
                            onClick={() => onSelect(c.id)}
                            className="w-full rounded-2xl px-3 py-3 text-left transition-colors"
                            style={{
                              background: isActive
                                ? 'var(--mirror-accent-subtle)'
                                : isHovered
                                  ? 'var(--mirror-elevated)'
                                  : 'transparent',
                              border: `1px solid ${isActive ? 'var(--mirror-accent)' : 'transparent'}`,
                            }}
                          >
                            <span
                              className="block truncate pr-7 text-sm font-medium leading-snug"
                              style={{ color: 'var(--mirror-text)' }}
                            >
                              {c.title ?? 'New Conversation'}
                            </span>
                          <span
                            className="mt-1 flex items-center gap-1.5 truncate text-[11px]"
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

                          </button>
                          {(isHovered || isActive) && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteClick(e, c.id)}
                              title={isConfirming ? 'Click again to confirm' : 'Delete'}
                              className="mirror-focus-ring absolute right-2 top-2 flex items-center justify-center rounded-full transition-colors"
                              style={{
                                width: '24px',
                                height: '24px',
                                color: isConfirming ? '#f87171' : 'var(--mirror-muted)',
                                background: isConfirming ? 'rgba(248,113,113,0.1)' : 'transparent',
                              }}
                            >
                              <Trash2 size={11} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                    </ul>
                  )
                )}
              </section>

              <section
                className="rounded-[24px] border px-3 py-3"
                style={{
                  background: 'linear-gradient(135deg, color-mix(in srgb, var(--mirror-accent) 8%, var(--mirror-surface)), var(--mirror-surface))',
                  borderColor: 'color-mix(in srgb, var(--mirror-accent) 18%, var(--mirror-border))',
                }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: 'var(--mirror-accent-hover)' }}
                >
                  Node insights
                </div>
                <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--mirror-secondary)' }}>
                  Key patterns: desire for respect, work bleeding over, need for spaciousness.
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Desire for respect', 'Work bleeding over', 'Need for spaciousness'].map((pattern) => (
                    <span
                      key={pattern}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--mirror-accent) 10%, transparent)',
                        color: 'var(--mirror-accent-hover)',
                        border: '1px solid color-mix(in srgb, var(--mirror-accent) 18%, var(--mirror-border))',
                      }}
                      >
                      {pattern}
                      </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderTop: '1px solid var(--mirror-border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
            {conversations.length}{' '}
            {conversations.length === 1 ? 'note' : 'notes'}
          </span>
          <span
            className="rounded-full px-2 py-1 text-[9px] font-semibold tracking-[0.18em]"
            style={{
              background: 'var(--mirror-accent-subtle)',
              color: 'var(--mirror-accent)',
            }}
            title="Running with mock LLM"
          >
            MOCK
          </span>
        </div>
      </div>
    </aside>
  )
}
