'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import {
  Send,
  Loader2,
  MessageCircle,
  Settings2,
  Sparkles,
  RefreshCw,
  X,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react'
import { Message, Conversation, ConversationTag } from '@/types'
import { useSettings } from '@/lib/settings'

interface ChatInterfaceProps {
  conversation: Conversation | null
  onboardingPrompt: string | null
  onCreateConversation: () => Promise<void>
  onSendMessage: (content: string) => Promise<void>
  onUpdateTags: () => Promise<void>
  onRemoveTag: (nodeId: string) => Promise<void>
  isSending: boolean
  isUpdatingTags: boolean
  layout?: 'main' | 'side'
}

export default function ChatInterface({
  conversation,
  onboardingPrompt,
  onCreateConversation,
  onSendMessage,
  onUpdateTags,
  onRemoveTag,
  isSending,
  isUpdatingTags,
  layout = 'main',
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { openSettings, rightCollapsed, toggleRight } = useSettings()

  const messages = conversation?.messages ?? []

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

  // ─── Empty state (no conversation selected) ──────────────
  if (!conversation) {
    if (layout === 'side' && rightCollapsed) {
      return (
        <aside
          className="flex h-screen flex-col items-center justify-between py-5"
          style={{
            width: '72px',
            flex: '0 0 auto',
            background: 'var(--mirror-pane)',
            borderLeft: '1px solid var(--mirror-border)',
          }}
        >
          <button
            type="button"
            onClick={toggleRight}
            className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
            aria-label="Open conversation"
          >
            <PanelRightOpen size={16} />
          </button>
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl"
            style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
          >
            <MessageCircle size={18} />
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
            aria-label="Open settings"
          >
            <Settings2 size={16} />
          </button>
        </aside>
      )
    }

    return (
        <aside
        className="relative flex h-screen flex-col"
        style={{
          width: layout === 'side' ? '380px' : 'auto',
          flex: layout === 'side' ? '0 0 auto' : '1 1 auto',
          background: 'var(--mirror-pane)',
          borderLeft: layout === 'side' ? '1px solid var(--mirror-border)' : 'none',
        }}
      >
        <button
          type="button"
          onClick={openSettings}
          className="mirror-focus-ring absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{
            background: 'var(--mirror-elevated)',
            color: 'var(--mirror-secondary)',
          }}
          aria-label="Open settings"
        >
          <Settings2 size={16} />
        </button>
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
              Select or start a conversation
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              Mirror is a reflective companion. As you talk, a living map of your inner
              world takes shape in the center.
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

  if (layout === 'side' && rightCollapsed) {
    return (
      <aside
        className="flex h-screen flex-col items-center justify-between py-5"
        style={{
          width: '72px',
          flex: '0 0 auto',
          background: 'var(--mirror-pane)',
          borderLeft: '1px solid var(--mirror-border)',
        }}
      >
        <button
          type="button"
          onClick={toggleRight}
          className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
          aria-label="Open conversation"
        >
          <PanelRightOpen size={16} />
        </button>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
        >
          <MessageCircle size={18} />
        </div>
        <button
          type="button"
          onClick={openSettings}
          className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
          aria-label="Open settings"
        >
          <Settings2 size={16} />
        </button>
      </aside>
    )
  }

  return (
    <aside
      className="flex h-screen min-w-0 flex-col overflow-hidden"
      style={{
        width: layout === 'side' ? '380px' : 'auto',
        flex: layout === 'side' ? '0 0 auto' : '1 1 auto',
        background: 'var(--mirror-pane)',
        borderLeft: layout === 'side' ? '1px solid var(--mirror-border)' : 'none',
      }}
    >
      <div
        className={`flex flex-shrink-0 items-center justify-between ${layout === 'side' ? 'px-5 py-5' : 'px-8 py-6'}`}
        style={{
          borderBottom: '1px solid var(--mirror-border)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--mirror-nav) 92%, transparent), var(--mirror-pane))',
        }}
      >
        <div>
          <div
            className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: 'var(--mirror-secondary)' }}
          >
            Active reflection
          </div>
          <h2 className="text-base font-semibold" style={{ color: 'var(--mirror-text)' }}>
            {conversation.title ?? 'New Conversation'}
          </h2>
          <p className="mt-1 text-xs" style={{ color: 'var(--mirror-muted)' }}>
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(conversation.tags ?? []).map((tag) => (
              <ConversationTagPill
                key={tag.nodeId}
                tag={tag}
                onRemove={onRemoveTag}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {layout === 'side' && (
            <button
              type="button"
              onClick={toggleRight}
              className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
              style={{
                background: 'var(--mirror-elevated)',
                color: 'var(--mirror-secondary)',
              }}
              aria-label="Collapse conversation"
            >
              <PanelRightClose size={16} />
            </button>
          )}
          <div className="hidden items-center gap-1.5 sm:flex">
            <Sparkles size={11} style={{ color: 'var(--mirror-accent)' }} />
            <span className="text-xs" style={{ color: 'var(--mirror-secondary)' }}>
              Guided reflection
            </span>
          </div>
          <button
            type="button"
            onClick={openSettings}
            className="mirror-focus-ring flex h-10 w-10 items-center justify-center rounded-full transition-colors"
            style={{
              background: 'var(--mirror-elevated)',
              color: 'var(--mirror-secondary)',
            }}
            aria-label="Open settings"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`${layout === 'side' ? 'flex-1 overflow-y-auto px-5 py-5' : 'flex-1 overflow-y-auto px-6 py-6 sm:px-8'}`}
      >
        <div className={`flex flex-col gap-6 ${layout === 'side' ? '' : 'mx-auto max-w-3xl'}`}>
          <div className="rounded-[28px] border px-5 py-4 sm:px-6" style={{
            background: 'var(--mirror-surface)',
            borderColor: 'var(--mirror-border)',
          }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'var(--mirror-secondary)' }}>
              <Sparkles size={11} style={{ color: 'var(--mirror-accent)' }} />
              Guided reflection
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: 'var(--mirror-secondary)' }}>
              Keep the conversation concrete. When you are ready, update the map to tag the note with a small set of durable life nodes.
            </p>
          </div>

          {messages.length === 0 && onboardingPrompt && (
            <MessageBubble role="assistant" content={onboardingPrompt} isOnboarding />
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}

          {isSending && (
            <div className="flex items-center gap-2 pl-1">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--mirror-accent)' }} />
              <span className="text-xs italic" style={{ color: 'var(--mirror-muted)' }}>
                Mirror is reflecting…
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex-shrink-0 ${layout === 'side' ? 'px-5 pb-5 pt-4' : 'px-6 pb-6 pt-4 sm:px-8'}`}
        style={{
          borderTop: '1px solid var(--mirror-border)',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--mirror-pane) 70%, transparent), var(--mirror-nav))',
        }}
      >
        <div
          className={`rounded-[28px] border p-3 shadow-sm ${layout === 'side' ? '' : 'mx-auto max-w-3xl'}`}
          style={{
            background: 'var(--mirror-surface)',
            borderColor: 'var(--mirror-border)',
          }}
        >
          <div className="mb-3 flex items-center justify-between px-2">
            <button
              type="button"
              onClick={onUpdateTags}
              disabled={isUpdatingTags || messages.length === 0}
              className="mirror-focus-ring flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-medium transition-colors"
              style={{
                background:
                  isUpdatingTags || messages.length === 0
                    ? 'var(--mirror-elevated)'
                    : 'var(--mirror-accent-subtle)',
                color:
                  isUpdatingTags || messages.length === 0
                    ? 'var(--mirror-muted)'
                    : 'var(--mirror-accent)',
                cursor:
                  isUpdatingTags || messages.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <RefreshCw size={12} className={isUpdatingTags ? 'animate-spin' : ''} />
              {isUpdatingTags ? 'Updating map' : 'Update map'}
            </button>
          </div>
          <div className="flex items-end gap-3 rounded-3xl px-3 py-2" style={{ background: 'var(--mirror-elevated)' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Share what feels most alive right now."
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
  isOnboarding?: boolean
}

function MessageBubble({ role, content, isOnboarding }: MessageBubbleProps) {
  const isUser = role === 'user'
  const roleLabel = isOnboarding ? 'Onboarding' : isUser ? 'You' : 'Mirror'

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-[26px] border px-4 py-3 sm:px-5"
        style={{
          background: isUser
            ? 'var(--mirror-user-message-bg)'
            : isOnboarding
              ? 'transparent'
              : 'var(--mirror-mirror-message-bg)',
          border: isOnboarding
            ? '1px dashed var(--mirror-border)'
            : isUser
              ? '1px solid var(--mirror-user-message-border)'
              : '1px solid var(--mirror-mirror-message-border)',
          color: 'var(--mirror-text)',
          boxShadow: isOnboarding ? 'none' : '0 10px 24px rgba(53, 42, 27, 0.04)',
        }}
      >
        <div
          className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider"
          style={{
            color: isOnboarding
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
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            fontFamily: isUser ? 'inherit' : 'Georgia, serif',
          }}
        >
          {content}
        </p>
      </div>
    </div>
  )
}

function ConversationTagPill({
  tag,
  onRemove,
}: {
  tag: ConversationTag
  onRemove: (nodeId: string) => Promise<void>
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs"
      style={{
        borderColor: 'var(--mirror-border)',
        background: 'color-mix(in srgb, var(--mirror-surface) 72%, transparent)',
        color: 'color-mix(in srgb, var(--mirror-secondary) 78%, transparent)',
        backdropFilter: 'blur(8px)',
        opacity: 0.82,
      }}
    >
      <span>{tag.label}</span>
      <button
        type="button"
        onClick={() => void onRemove(tag.nodeId)}
        className="mirror-focus-ring flex h-4 w-4 items-center justify-center rounded-full"
        style={{ color: 'color-mix(in srgb, var(--mirror-muted) 82%, transparent)' }}
        aria-label={`Remove ${tag.label} tag`}
      >
        <X size={11} />
      </button>
    </span>
  )
}
