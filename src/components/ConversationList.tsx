'use client'

import { useState } from 'react'
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen, Sparkles, Trash2, X } from 'lucide-react'
import { ConversationListItem, NodeView } from '@/types'
import { useSettings } from '@/lib/settings'
import { formatDate } from '@/lib/utils'

interface ConversationListProps {
  conversations: ConversationListItem[]
  activeConversationId: string | null
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  nodeView: NodeView | null
  onClearNodeView: () => void
}

export default function ConversationList({
  conversations,
  activeConversationId,
  onSelect,
  onCreate,
  onDelete,
  nodeView,
  onClearNodeView,
}: ConversationListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { leftCollapsed, toggleLeft } = useSettings()

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
      className="flex h-screen overflow-hidden select-none transition-[width] duration-200"
      style={{
        width: leftCollapsed ? '72px' : '280px',
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
            {!leftCollapsed && (
              <div className="min-w-0">
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: 'var(--mirror-secondary)' }}
                >
                  Workspace
                </div>
                <div className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
                  Mirror history
                </div>
              </div>
            )}
          </div>
          <div className={`flex items-center ${leftCollapsed ? 'flex-col gap-2' : 'gap-2'}`}>
            <button
              type="button"
              onClick={onCreate}
              title="New conversation"
              aria-label="New conversation"
              className="mirror-focus-ring flex items-center justify-center rounded-full transition-colors"
              style={{
                width: '32px',
                height: '32px',
                color: 'var(--mirror-secondary)',
                background: 'var(--mirror-elevated)',
              }}
            >
              <MessageSquarePlus size={15} />
            </button>
            <button
              type="button"
              onClick={toggleLeft}
              title={leftCollapsed ? 'Expand history' : 'Collapse history'}
              aria-label={leftCollapsed ? 'Expand history' : 'Collapse history'}
              className="mirror-focus-ring flex items-center justify-center rounded-full transition-colors"
              style={{
                width: '32px',
                height: '32px',
                color: 'var(--mirror-secondary)',
                background: 'var(--mirror-elevated)',
              }}
            >
              {leftCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {leftCollapsed ? (
            <div />
          ) : conversations.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                {nodeView ? 'No notes tagged with this node yet.' : 'No conversations yet.'}
              </p>
              {nodeView ? (
                <button
                  type="button"
                  onClick={onClearNodeView}
                  className="mirror-focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--mirror-accent-subtle)',
                    color: 'var(--mirror-accent)',
                  }}
                >
                  Exit node view
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onCreate}
                  className="mirror-focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    background: 'var(--mirror-accent-subtle)',
                    color: 'var(--mirror-accent)',
                  }}
                >
                  Start one
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3 px-3">
              {nodeView && (
                <div
                  className="flex items-center justify-between rounded-2xl border px-3 py-2"
                  style={{
                    background: 'rgba(168, 213, 186, 0.16)',
                    borderColor: 'rgba(95, 145, 115, 0.24)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24)',
                  }}
                >
                  <div className="min-w-0">
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.18em]"
                      style={{ color: 'rgba(66, 107, 82, 0.88)' }}
                    >
                      Node view
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span
                        className="inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[11px] font-medium"
                        style={{
                          background: 'rgba(111, 163, 129, 0.16)',
                          color: 'rgb(59, 94, 72)',
                          border: '1px solid rgba(95, 145, 115, 0.2)',
                        }}
                      >
                        {nodeView.label}
                      </span>
                      <span className="truncate text-xs" style={{ color: 'rgba(66, 107, 82, 0.8)' }}>
                        Matching notes only
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClearNodeView}
                    className="mirror-focus-ring flex h-7 w-7 items-center justify-center rounded-full"
                    style={{
                      background: 'rgba(255,255,255,0.5)',
                      color: 'rgb(59, 94, 72)',
                    }}
                    aria-label="Exit node view"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
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
            </div>
          )}
        </div>

        <div
          className={`px-4 py-3 ${leftCollapsed ? 'flex justify-center' : 'flex items-center justify-between'}`}
          style={{ borderTop: '1px solid var(--mirror-border)' }}
        >
          {!leftCollapsed && (
            <span className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
              {conversations.length}{' '}
              {conversations.length === 1 ? 'conversation' : 'conversations'}
            </span>
          )}
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
