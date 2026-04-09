'use client'

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import { Send, Loader2, MessageCircle, Sparkles } from 'lucide-react'
import { Message, Conversation } from '@/types'

interface ChatInterfaceProps {
  conversation: Conversation | null
  onboardingPrompt: string | null
  onSendMessage: (content: string) => Promise<void>
  isSending: boolean
}

export default function ChatInterface({
  conversation,
  onboardingPrompt,
  onSendMessage,
  isSending,
}: ChatInterfaceProps) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 h-screen"
        style={{ background: 'var(--mirror-pane)' }}
      >
        <div className="text-center space-y-4 max-w-md px-8">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
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
              world takes shape on the right.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col flex-1 h-screen overflow-hidden"
      style={{ background: 'var(--mirror-pane)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--mirror-border)',
          background: 'var(--mirror-nav)',
        }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
            {conversation.title ?? 'New Conversation'}
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--mirror-muted)' }}>
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Sparkles size={11} style={{ color: 'var(--mirror-accent)' }} />
          <span className="text-xs" style={{ color: 'var(--mirror-secondary)' }}>
            Guided reflection
          </span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Onboarding prompt (shown when conversation is empty) */}
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

      {/* Input */}
      <div
        className="flex-shrink-0 px-6 py-4"
        style={{
          borderTop: '1px solid var(--mirror-border)',
          background: 'var(--mirror-nav)',
        }}
      >
        <div
          className="max-w-2xl mx-auto flex items-end gap-3 rounded-xl px-4 py-3"
          style={{
            background: 'var(--mirror-elevated)',
            border: '1px solid var(--mirror-border)',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Share what's on your mind…"
            rows={1}
            disabled={isSending}
            className="flex-1 resize-none bg-transparent outline-none text-sm leading-relaxed"
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
            className="flex items-center justify-center rounded-lg transition-all flex-shrink-0"
            style={{
              width: '32px',
              height: '32px',
              background:
                !input.trim() || isSending ? 'var(--mirror-border)' : 'var(--mirror-accent)',
              color: !input.trim() || isSending ? 'var(--mirror-muted)' : '#0f0d0b',
              cursor: !input.trim() || isSending ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={13} />
          </button>
        </div>
        <p
          className="text-xs mt-2 text-center"
          style={{ color: 'var(--mirror-muted)', fontSize: '10px' }}
        >
          Press <kbd style={{ fontFamily: 'monospace' }}>Enter</kbd> to send ·{' '}
          <kbd style={{ fontFamily: 'monospace' }}>Shift+Enter</kbd> for newline
        </p>
      </div>
    </div>
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

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[85%] rounded-2xl px-4 py-3"
        style={{
          background: isUser
            ? 'var(--mirror-accent-dim)'
            : isOnboarding
            ? 'transparent'
            : 'var(--mirror-elevated)',
          border: isOnboarding ? '1px dashed var(--mirror-border)' : 'none',
          color: 'var(--mirror-text)',
        }}
      >
        {isOnboarding && (
          <div
            className="flex items-center gap-1.5 mb-1.5 text-xs font-medium uppercase tracking-wider"
            style={{ color: 'var(--mirror-accent)', fontSize: '10px' }}
          >
            <Sparkles size={10} />
            Onboarding
          </div>
        )}
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
