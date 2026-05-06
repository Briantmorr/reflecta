'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { Message } from '@/types'
import { MIcon } from './icons'

interface StickyNoteProps {
  zIndex?: number
  active?: boolean
  onActivate?: () => void
  messages: Message[]
  assistantDraft?: {
    content: string
    status: 'reading_context' | 'context_nodes' | 'streaming'
    nodeLabels: string[]
  } | null
  isSending?: boolean
  isUpdatingMap?: boolean
  isDeleting?: boolean
  canUpdateMap?: boolean
  canDelete?: boolean
  topic?: string | null
  onSendMessage: (content: string) => Promise<void> | void
  onNewConversation: () => Promise<void> | void
  onUpdateMap: () => Promise<void> | void
  onDeleteConversation: () => Promise<void> | void
}

export function StickyNote({
  zIndex = 20,
  active = true,
  onActivate,
  messages,
  assistantDraft,
  isSending = false,
  isUpdatingMap = false,
  isDeleting = false,
  canUpdateMap = false,
  canDelete = false,
  topic,
  onSendMessage,
  onNewConversation,
  onUpdateMap,
  onDeleteConversation,
}: StickyNoteProps) {
  const [text, setText] = useState('')
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const now = new Date()

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [messages, assistantDraft?.content])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || isSending) return
    setText('')
    try {
      await onSendMessage(trimmed)
    } finally {
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onPointerDown={onActivate}
      style={{
        position: 'absolute',
        top: active ? 84 : 58,
        right: active ? 44 : 70,
        width: 360,
        height: 720,
        background: 'linear-gradient(180deg, #fce896 0%, #f6d977 100%)',
        boxShadow: active
          ? '0 26px 42px -12px rgba(40,25,10,0.52), 0 8px 14px rgba(40,25,10,0.2), 0 0 0 0.5px rgba(122,90,40,0.35)'
          : '0 18px 34px -18px rgba(40,25,10,0.42), 0 0 0 0.5px rgba(122,90,40,0.24)',
        transform: active ? 'rotate(-2deg) translateY(0)' : 'rotate(-2deg) translateY(0)',
        fontFamily: 'var(--serif)',
        zIndex,
        opacity: active ? 1 : 0.92,
        transition: 'top 180ms ease, right 180ms ease, transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease',
        pointerEvents: 'auto',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -14,
          left: '50%',
          transform: 'translateX(-50%) rotate(-3deg)',
          width: 130,
          height: 22,
          background: 'rgba(220,200,140,0.55)',
          border: '0.5px solid rgba(180,150,90,0.5)',
          borderRadius: 1,
          boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        }}
      />

      <div
        style={{
          padding: '18px 24px 10px',
          borderBottom: '0.5px dashed rgba(122,74,30,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.24em', color: '#7a4a1e', textTransform: 'uppercase' }}>
            mirror · conversation
          </div>
          <button
            type="button"
            disabled={isSending || isDeleting || isUpdatingMap}
            onClick={(event) => {
              event.stopPropagation()
              void onNewConversation()
            }}
            style={noteActionButtonStyle(isSending || isDeleting || isUpdatingMap)}
          >
            new
          </button>
        </div>
        <div style={{ marginTop: 3, fontSize: 13, color: '#5a3a1e', fontStyle: 'italic' }}>
          {formatThreadDate(now)} · {timeOfDay(now)}
          {topic ? ` · about ${topic}` : ''}
        </div>
      </div>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '14px 22px 6px',
          color: '#2a1f10',
        }}
      >
        {messages.length === 0 && !assistantDraft ? (
          <div
            style={{
              marginTop: 6,
              paddingLeft: 12,
              borderLeft: '1.5px solid #a23b1e',
              fontSize: 18,
              lineHeight: 1.4,
              fontStyle: 'italic',
              color: '#2a2318',
            }}
          >
            What's been on your mind lately?
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {messages.map((message) => (
              <StickyMessage key={message.id} message={message} />
            ))}
            {assistantDraft && <StickyMessage message={draftToMessage(assistantDraft.content)} loading />}
            {assistantDraft && assistantDraft.nodeLabels.length > 0 && assistantDraft.status !== 'streaming' && (
              <div style={{ marginTop: -8, marginBottom: 14, paddingLeft: 14, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.08em', color: '#7a4a1e' }}>
                {assistantDraft.nodeLabels.join(' · ')}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: '12px 22px 16px',
          borderTop: '0.5px dashed rgba(122,74,30,0.4)',
          background: 'rgba(255,235,150,0.4)',
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#7a4a1e' }}>
          {isSending ? 'mirror · writing' : 'you · typing'}
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              event.currentTarget.form?.requestSubmit()
            }
          }}
          placeholder={messages.length === 0 ? "What's on your mind?" : 'write back...'}
          rows={3}
          disabled={isSending}
          style={{
            width: '100%',
            minHeight: 62,
            resize: 'none',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: 'var(--serif)',
            fontSize: 15,
            color: '#2a1f10',
            fontStyle: 'italic',
            lineHeight: 1.45,
            marginTop: 6,
            opacity: isSending ? 0.55 : 1,
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, fontSize: 10, color: '#7a4a1e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              disabled={!canUpdateMap || isUpdatingMap || isSending || isDeleting}
              onClick={(event) => {
                event.stopPropagation()
                void onUpdateMap()
              }}
              style={noteActionButtonStyle(!canUpdateMap || isUpdatingMap || isSending || isDeleting)}
            >
              {isUpdatingMap && <InlineSpinner />}
              {isUpdatingMap ? 'updating...' : 'update map'}
            </button>
            <button
              type="button"
              disabled={!canDelete || isSending || isUpdatingMap || isDeleting}
              onClick={(event) => {
                event.stopPropagation()
                void onDeleteConversation()
              }}
              style={noteActionButtonStyle(!canDelete || isSending || isUpdatingMap || isDeleting)}
            >
              {isDeleting && <InlineSpinner />}
              {isDeleting ? 'deleting...' : 'delete'}
            </button>
          </div>
          <button
            type="submit"
            disabled={isSending || isDeleting || !text.trim()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 14px',
              border: 'none',
              background: '#2a1f10',
              color: '#fce896',
              fontSize: 11,
              fontStyle: 'italic',
              cursor: isSending || isDeleting || !text.trim() ? 'default' : 'pointer',
              opacity: isSending || isDeleting || !text.trim() ? 0.45 : 1,
            }}
          >
            send <MIcon name="send" size={12} />
          </button>
        </div>
      </div>
    </form>
  )
}

function noteActionButtonStyle(disabled: boolean) {
  return {
    border: '0.5px solid rgba(122,74,30,0.28)',
    background: 'rgba(251,245,228,0.45)',
    color: '#7a4a1e',
    padding: '5px 8px',
    fontFamily: 'var(--mono)',
    fontSize: 8,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  } as const
}

function InlineSpinner() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 9,
        height: 9,
        borderRadius: 999,
        border: '1px solid currentColor',
        borderTopColor: 'transparent',
        display: 'inline-block',
        animation: 'mirror-note-spin 700ms linear infinite',
      }}
    />
  )
}

function StickyMessage({ message, loading = false }: { message: Message; loading?: boolean }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        marginBottom: 14,
        paddingLeft: isUser ? 0 : 12,
        borderLeft: isUser ? 'none' : '1.5px solid #a23b1e',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--mono)',
          fontSize: 9,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: isUser ? '#7a4a1e' : '#a23b1e',
          display: 'flex',
          gap: 8,
          alignItems: 'baseline',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
        }}
      >
        <span>{isUser ? 'you' : 'mirror'}</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span style={{ opacity: 0.7 }}>{formatMessageTime(message.createdAt)}</span>
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 13.5,
          lineHeight: 1.5,
          fontStyle: isUser ? 'normal' : 'italic',
          whiteSpace: 'pre-wrap',
          textAlign: isUser ? 'right' : 'left',
          color: isUser ? '#1a140c' : '#2a2318',
          opacity: loading ? 0.9 : 1,
        }}
      >
        {message.content}
      </div>
    </div>
  )
}

function draftToMessage(content: string): Message {
  return {
    id: 'assistant-draft',
    conversationId: 'draft',
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
  }
}

function formatMessageTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

function formatThreadDate(date: Date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' }).replace('.', '')
  const day = date.toLocaleDateString(undefined, { day: '2-digit' })
  const month = date.toLocaleDateString(undefined, { month: 'short' })
  return `${weekday} ${day} ${month}`
}

function timeOfDay(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
