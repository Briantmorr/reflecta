'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import {
  Send,
  Loader2,
  MessageCircle,
  Sparkles,
  RefreshCw,
  PlusCircle,
  Maximize2,
  Minimize2,
  Trash2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Message, Conversation } from '@/types'

interface ChatInterfaceProps {
  conversation: Conversation | null
  starterPrompt: string | null
  onCreateConversation: () => void
  onSendMessage: (content: string) => Promise<void>
  onDeleteConversation: (id: string) => Promise<void> | void
  onUpdateTags: () => Promise<void>
  onRemoveTag: (nodeId: string) => Promise<void>
  isSending: boolean
  isUpdatingTags: boolean
  assistantDraft?: {
    content: string
    status: 'reading_context' | 'context_nodes' | 'streaming'
    nodeLabels: string[]
  } | null
  initialInput?: string
  layout?: 'main' | 'side'
  side?: 'left' | 'right'
}

export default function ChatInterface({
  conversation,
  starterPrompt,
  onCreateConversation,
  onSendMessage,
  onDeleteConversation,
  onUpdateTags,
  onRemoveTag,
  isSending,
  isUpdatingTags,
  assistantDraft,
  initialInput,
  layout = 'main',
  side = 'right',
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [connectedNodesOpen, setConnectedNodesOpen] = useState(false)
  const [confirmDeleteConversation, setConfirmDeleteConversation] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const messages = conversation?.messages ?? []
  const isDraft = !conversation && !!starterPrompt
  const sideWidth = isExpanded ? 'min(760px, 52vw)' : '380px'

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isSending])

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [input, adjustTextareaHeight])

  useEffect(() => {
    setInput('')
    setConfirmDeleteConversation(false)
    setConnectedNodesOpen(false)
  }, [conversation?.id, starterPrompt])

  useEffect(() => {
    if (initialInput) setInput(initialInput)
  }, [initialInput])

  const handleDeleteConversation = async () => {
    if (!conversation) return
    if (!confirmDeleteConversation) {
      setConfirmDeleteConversation(true)
      setTimeout(() => setConfirmDeleteConversation(false), 3000)
      return
    }
    try {
      await onDeleteConversation(conversation.id)
    } catch (err) {
      console.error(err)
    } finally {
      setConfirmDeleteConversation(false)
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return
    setInput('')
    await onSendMessage(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ─── Empty state (no conversation and no draft starter) ──
  if (!conversation && !starterPrompt) {
    return (
      <aside
        className="relative flex h-full flex-col overflow-hidden rounded-[34px]"
        style={{
          width: layout === 'side' ? sideWidth : 'auto',
          flex: layout === 'side' ? '0 0 auto' : '1 1 auto',
          background: 'color-mix(in srgb, var(--mirror-pane) 92%, transparent)',
          backdropFilter: 'blur(22px)',
          boxShadow:
            layout === 'side'
              ? side === 'right'
                ? '-18px 0 42px rgba(53, 42, 27, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.42)'
                : '18px 0 42px rgba(53, 42, 27, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.42)'
              : 'none',
        }}
      >
        <div
          className={`flex flex-1 flex-col justify-center ${layout === 'side' ? 'px-6' : 'items-center px-8 text-center'}`}
        >
          <div className={`${layout === 'side' ? 'space-y-4' : 'text-center space-y-4 max-w-md'}`}>
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full ${layout === 'side' ? '' : 'mx-auto'}`}
              style={{ background: 'var(--mirror-elevated)' }}
            >
              <MessageCircle size={22} style={{ color: 'var(--mirror-muted)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--mirror-text)' }}>
                Start with one question
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                What&apos;s been on your mind lately?
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={onCreateConversation}
                className="mirror-focus-ring rounded-full px-4 py-2 text-sm font-medium transition-colors"
                style={{
                  background: 'var(--mirror-accent)',
                  color: 'var(--mirror-accent-contrast)',
                }}
              >
                Start conversation
              </button>
            </div>
          </div>
        </div>
      </aside>
    )
  }

  const headerTitle = isDraft
    ? 'New reflection'
    : conversation?.title ?? 'New Conversation'

  return (
    <aside
      className="flex h-full min-w-0 flex-col overflow-hidden rounded-[34px]"
      style={{
        width: layout === 'side' ? sideWidth : 'auto',
        flex: layout === 'side' ? '0 0 auto' : '1 1 auto',
        background: 'color-mix(in srgb, var(--mirror-pane) 92%, transparent)',
        backdropFilter: 'blur(22px)',
        boxShadow:
          layout === 'side'
            ? side === 'right'
              ? '-18px 0 42px rgba(53, 42, 27, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.42)'
              : '18px 0 42px rgba(53, 42, 27, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.42)'
            : 'none',
      }}
    >
      <div
        className={`flex flex-shrink-0 flex-col gap-3 ${layout === 'side' ? 'px-5 py-5' : 'px-8 py-6'}`}
        style={{
          boxShadow: 'inset 0 -1px 0 rgba(53, 42, 27, 0.05)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--mirror-nav) 92%, transparent), var(--mirror-pane))',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 pr-3">
            <div
              className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--mirror-secondary)' }}
            >
              Active reflection
            </div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--mirror-text)' }}>
              {headerTitle}
            </h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--mirror-muted)' }}>
              {isDraft ? 'Draft. Saved when you send.' : `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {layout === 'side' && (
              <button
                type="button"
                onClick={() => setIsExpanded((expanded) => !expanded)}
                className="mirror-focus-ring flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  background: 'var(--mirror-elevated)',
                  color: 'var(--mirror-secondary)',
                  boxShadow: 'inset 0 0 0 1px rgba(53, 42, 27, 0.05)',
                }}
                aria-label={isExpanded ? 'Collapse active reflection' : 'Expand active reflection'}
                title={isExpanded ? 'Collapse active reflection' : 'Expand active reflection'}
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                {isExpanded ? 'Compact' : 'Expand'}
              </button>
            )}
            {conversation && (
              <button
                type="button"
                onClick={handleDeleteConversation}
                className="mirror-focus-ring flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors"
                style={{
                  background: confirmDeleteConversation
                    ? 'color-mix(in srgb, #c2410c 14%, var(--mirror-elevated))'
                    : 'var(--mirror-elevated)',
                  color: confirmDeleteConversation ? '#c2410c' : 'var(--mirror-secondary)',
                  boxShadow: 'inset 0 0 0 1px rgba(53, 42, 27, 0.05)',
                }}
                aria-label={confirmDeleteConversation ? 'Confirm delete entry' : 'Delete entry'}
                title={confirmDeleteConversation ? 'Click again to permanently delete this entry' : 'Delete entry'}
              >
                <Trash2 size={13} />
                {confirmDeleteConversation ? 'Sure?' : 'Delete'}
              </button>
            )}
            <button
              type="button"
              onClick={onCreateConversation}
              className="mirror-focus-ring flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors"
              style={{
                background: 'color-mix(in srgb, var(--mirror-accent) 8%, var(--mirror-elevated))',
                color: 'var(--mirror-accent-hover)',
                boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--mirror-accent) 16%, transparent)',
              }}
              aria-label="Start a new reflection"
            >
              <PlusCircle size={14} />
              New
            </button>
          </div>
        </div>

        {conversation && (
          <button
            type="button"
            onClick={() => setConnectedNodesOpen((open) => !open)}
            className="mirror-focus-ring flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left transition-colors"
            style={{
              background: 'color-mix(in srgb, var(--mirror-surface) 72%, transparent)',
              color: 'var(--mirror-secondary)',
              boxShadow: 'inset 0 0 0 1px rgba(53, 42, 27, 0.04)',
            }}
            aria-expanded={connectedNodesOpen}
          >
            <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
              Connected nodes
            </span>
            <span className="flex items-center gap-1.5 text-[11px]">
              {conversation.tags?.length ?? 0}
              {connectedNodesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          </button>
        )}
        {conversation && connectedNodesOpen && (
          <div className="flex flex-wrap gap-1.5">
            {(conversation.tags ?? []).length > 0 ? (
              conversation.tags!.map((tag) => (
                <span
                  key={tag.nodeId}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    background: 'var(--mirror-accent-subtle)',
                    color: 'var(--mirror-accent-hover)',
                    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--mirror-accent) 14%, transparent)',
                  }}
                >
                  {tag.label}
                </span>
              ))
            ) : (
              <span className="text-[11px]" style={{ color: 'var(--mirror-muted)' }}>
                No nodes tagged yet. Use Update map after the entry has enough signal.
              </span>
            )}
          </div>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`${layout === 'side' ? 'flex-1 overflow-y-auto px-5 py-5' : 'flex-1 overflow-y-auto px-6 py-6 sm:px-8'}`}
      >
        <div className={`flex flex-col gap-6 ${layout === 'side' && isExpanded ? 'mx-auto w-full max-w-2xl' : layout === 'side' ? '' : 'mx-auto max-w-3xl'}`}>
          {messages.length === 0 && starterPrompt && (
            <MessageBubble role="assistant" content={starterPrompt} isStarter wide={isExpanded} />
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} wide={isExpanded} />
          ))}

          {assistantDraft ? (
            <MessageBubble
              role="assistant"
              content={assistantDraft.content}
              isLoading={assistantDraft.status !== 'streaming'}
              contextLabels={assistantDraft.nodeLabels}
              wide={isExpanded}
            />
          ) : isSending && (
            <div className="flex items-center gap-2 pl-1">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--mirror-accent)' }} />
              <span className="text-xs italic" style={{ color: 'var(--mirror-muted)' }}>
                Reading context...
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex-shrink-0 ${layout === 'side' ? 'px-5 pb-5 pt-4' : 'px-6 pb-6 pt-4 sm:px-8'}`}
        style={{
          boxShadow: 'inset 0 1px 0 rgba(53, 42, 27, 0.05)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--mirror-pane) 70%, transparent), var(--mirror-nav))',
        }}
      >
        <div
          className={`rounded-[28px] p-3 shadow-sm ${layout === 'side' && isExpanded ? 'mx-auto max-w-2xl' : layout === 'side' ? '' : 'mx-auto max-w-3xl'}`}
          style={{
            background: 'var(--mirror-surface)',
            boxShadow: '0 14px 30px rgba(53, 42, 27, 0.05)',
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 px-2">
            <button
              type="button"
              onClick={onUpdateTags}
              disabled={isDraft || isUpdatingTags || messages.length === 0}
              className="mirror-focus-ring relative flex min-w-[108px] items-center justify-center gap-2 overflow-hidden rounded-full px-3 py-2 text-[11px] font-medium transition-colors"
              style={{
                background:
                  isUpdatingTags
                    ? 'color-mix(in srgb, var(--mirror-accent) 14%, var(--mirror-elevated))'
                    : isDraft || messages.length === 0
                    ? 'var(--mirror-elevated)'
                    : 'var(--mirror-accent-subtle)',
                color:
                  isDraft || messages.length === 0
                    ? 'var(--mirror-muted)'
                    : 'var(--mirror-accent)',
                cursor:
                  isDraft || messages.length === 0 ? 'not-allowed' : isUpdatingTags ? 'progress' : 'pointer',
              }}
            >
              {isUpdatingTags && (
                <span
                  className="mirror-map-loading absolute inset-x-0 bottom-0 h-[2px]"
                  aria-hidden="true"
                />
              )}
              <RefreshCw size={12} className={isUpdatingTags ? 'animate-spin' : ''} />
              {isUpdatingTags ? 'Updating map' : 'Update map'}
            </button>
            {isUpdatingTags && (
              <span className="text-[11px]" style={{ color: 'var(--mirror-muted)' }}>
                Reading for durable nodes…
              </span>
            )}
          </div>
          <div className="flex items-end gap-3 rounded-3xl px-3 py-2" style={{ background: 'var(--mirror-elevated)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What's on your mind?"
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
              style={{
                color: 'var(--mirror-text)',
                caretColor: 'var(--mirror-accent)',
                minHeight: '22px',
                maxHeight: '160px',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="mirror-focus-ring flex h-11 w-11 items-center justify-center rounded-full transition-all"
              style={{
                background:
                  !input.trim() || isSending ? 'var(--mirror-border)' : 'var(--mirror-accent)',
                color: !input.trim() || isSending ? 'var(--mirror-muted)' : 'var(--mirror-accent-contrast)',
                cursor: !input.trim() || isSending ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} />
            </button>
          </div>
          <p
            className="px-3 pt-3 text-center text-[11px]"
            style={{ color: 'var(--mirror-muted)' }}
          >
            Press <kbd>Enter</kbd> to send. Use <kbd>Shift+Enter</kbd> for a new line.
          </p>
        </div>
      </div>
    </aside>
  )
}

// ─── Message bubble ─────────────────────────────────────────
interface MessageBubbleProps {
  role: Message['role']
  content: string
  isStarter?: boolean
  isLoading?: boolean
  contextLabels?: string[]
  wide?: boolean
}

function MessageBubble({
  role,
  content,
  isStarter,
  isLoading = false,
  contextLabels = [],
  wide = false,
}: MessageBubbleProps) {
  const isUser = role === 'user'
  const roleLabel = isStarter ? 'Starter' : isUser ? 'You' : 'Mirror'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`${wide ? 'max-w-[96%]' : 'max-w-[85%]'} rounded-[26px] border px-4 py-3 sm:px-5`}
        style={{
          background: isUser
            ? 'var(--mirror-user-message-bg)'
            : isStarter
              ? 'transparent'
              : 'var(--mirror-mirror-message-bg)',
          border: isStarter
            ? '1px dashed var(--mirror-border)'
            : isUser
              ? '1px solid var(--mirror-user-message-border)'
              : '1px solid var(--mirror-mirror-message-border)',
          color: 'var(--mirror-text)',
          boxShadow: isStarter ? 'none' : '0 10px 24px rgba(53, 42, 27, 0.04)',
        }}
      >
        <div
          className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider"
          style={{
            color: isStarter
              ? 'var(--mirror-accent)'
              : isUser
                ? 'var(--mirror-user-message-label)'
                : 'var(--mirror-mirror-message-label)',
            fontSize: '10px',
          }}
        >
          {!isUser && <Sparkles size={10} />}
          <span>{roleLabel}</span>
        </div>
        {contextLabels.length > 0 && (
          <div className="mb-2 space-y-1.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.16em]" style={{ color: 'var(--mirror-muted)' }}>
              Looking into context
            </div>
            <div className="flex flex-wrap gap-1.5">
            {contextLabels.slice(0, 5).map((label) => (
              <span
                key={label}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: 'var(--mirror-accent-subtle)',
                  color: 'var(--mirror-accent)',
                }}
              >
                {label}
              </span>
            ))}
            </div>
          </div>
        )}
        <p
          className={`text-sm leading-relaxed whitespace-pre-wrap ${isLoading ? 'italic' : ''}`}
          style={{
            fontFamily: isUser ? 'inherit' : 'Georgia, serif',
            color: isLoading ? 'var(--mirror-muted)' : 'var(--mirror-text)',
          }}
        >
          {content}
          {isLoading && (
            <Loader2
              size={12}
              className="ml-2 inline animate-spin align-[-2px]"
              style={{ color: 'var(--mirror-accent)' }}
            />
          )}
        </p>
      </div>
    </div>
  )
}
