'use client'

import { useEffect, useState } from 'react'
import { ConversationListItem, GraphNode } from '@/types'

interface NotebookSlipProps {
  node: GraphNode | null
  conversations: ConversationListItem[]
  onClose: () => void
  onBuildMemory: (nodeId: string) => Promise<void> | void
  onBuildInsights: (nodeId: string) => Promise<void> | void
  onSelectConversation: (conversationId: string) => Promise<void> | void
  isBuildingMemory?: boolean
  isBuildingInsights?: boolean
  zIndex?: number
  active?: boolean
  onActivate?: () => void
}

export function NotebookSlip({
  node,
  conversations,
  onClose,
  onBuildMemory,
  onBuildInsights,
  onSelectConversation,
  isBuildingMemory = false,
  isBuildingInsights = false,
  zIndex = 20,
  active = true,
  onActivate,
}: NotebookSlipProps) {
  const isEmpty = !node
  const isYou = node?.type === 'user'
  const matchingConversations = isYou
    ? conversations
    : node
      ? conversations.filter((conversation) =>
          (conversation.tags ?? []).some((tag) => tag.nodeId === node.id || tag.label.toLowerCase() === node.label.toLowerCase())
        )
      : []
  const memoryLines = splitMemory(node?.context?.text)
  const pattern = node?.insights?.summary?.trim()
  const [entriesOpen, setEntriesOpen] = useState(false)

  useEffect(() => {
    setEntriesOpen(false)
  }, [node?.id])

  return (
    <div
      onPointerDown={onActivate}
      style={{
        position: 'absolute',
        top: active ? 84 : 58,
        right: active ? 44 : 18,
        width: 360,
        height: 720,
        background: '#fef8e6',
        boxShadow: '0 30px 60px -20px rgba(50,30,10,0.4), 0 0 0 0.5px rgba(122,90,40,0.25)',
        padding: '26px 30px',
        fontFamily: 'var(--serif)',
        zIndex,
        overflow: 'hidden',
        opacity: active ? 1 : 0.94,
        transform: active ? 'rotate(-1.5deg) translateY(0)' : 'rotate(-1.5deg) translateY(0)',
        transition: 'top 180ms ease, right 180ms ease, transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -14,
          left: 40,
          width: 24,
          height: 60,
          borderRadius: '8px 8px 4px 4px',
          border: '2.5px solid #8a8a8a',
          borderBottom: 'none',
          transform: 'rotate(-14deg)',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.26em', textTransform: 'uppercase', color: '#6b5230', fontFamily: 'var(--mono)' }}>
          {isEmpty ? 'node memory' : isYou ? 'who you are' : `about · ${node.label.toLowerCase()}`}
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#8c7549', padding: 2, fontFamily: 'var(--mono)', fontSize: 14 }}>
          x
        </button>
      </div>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 34, fontWeight: 300, margin: '10px 0 0', lineHeight: 1.02, fontStyle: isYou ? 'normal' : 'italic', color: '#1a140c', letterSpacing: '-0.01em' }}>
        {isEmpty ? 'Select a node' : node.label}
      </h3>
      <div style={{ fontSize: 11, fontStyle: 'italic', color: '#6b5230', marginTop: 4 }}>
        {isEmpty
          ? 'Click a node on the map to open what Mirror remembers.'
          : `${matchingConversations.length} reflection${matchingConversations.length === 1 ? '' : 's'} · last noted today`}
      </div>

      {!isEmpty && !isYou && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={sectionLabelStyle}>entry insights</div>
            <button
              type="button"
              disabled={isBuildingInsights}
              onClick={(event) => {
                event.stopPropagation()
                if (node) void onBuildInsights(node.id)
              }}
              style={smallActionButtonStyle(false, isBuildingInsights)}
            >
              {isBuildingInsights ? 'building...' : 'build insights'}
            </button>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: '#2a2318', margin: '6px 0 0', fontStyle: 'italic' }}>
            {pattern ? `“${pattern}”` : 'No pattern distilled yet.'}
          </p>
          {(node?.insights?.bullets ?? []).length > 0 && (
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
              {(node?.insights?.bullets ?? []).slice(0, 3).map((bullet) => (
                <li key={bullet} style={{ fontSize: 12, color: '#4a3a20', padding: '2px 0', fontStyle: 'italic' }}>
                  · {bullet}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div style={sectionLabelStyle}>what I remember</div>
          <button
            type="button"
            disabled={isEmpty || isBuildingMemory}
            onClick={(event) => {
              event.stopPropagation()
              if (node) void onBuildMemory(node.id)
            }}
            style={smallActionButtonStyle(isEmpty, isBuildingMemory)}
          >
            {isBuildingMemory ? 'building...' : 'build memory'}
          </button>
        </div>
        <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
          {(isEmpty ? ['Select a node to view its memory.'] : memoryLines.length > 0 ? memoryLines : ['No memory written yet.']).map((line, index, list) => (
            <li
              key={`${line}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 10,
                padding: '6px 0',
                borderBottom: index < list.length - 1 ? '0.5px dashed rgba(138,106,58,0.3)' : 'none',
                fontSize: 14,
                color: '#1a140c',
              }}
            >
              <span style={{ color: '#a23b1e', fontFamily: 'var(--mono)', fontSize: 10 }}>·</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: 18 }}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setEntriesOpen((open) => !open)
          }}
          style={{
            ...sectionLabelStyle,
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          <span>entries tagged</span>
          <span>{entriesOpen ? 'hide' : `${matchingConversations.length} show`}</span>
        </button>
        {entriesOpen && (
          isEmpty ? (
            <p style={{ fontSize: 12, color: '#6b5230', fontStyle: 'italic' }}>Choose You, a domain, or any child node.</p>
          ) : matchingConversations.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b5230', fontStyle: 'italic' }}>No entries tagged yet.</p>
          ) : (
            matchingConversations.slice(0, 4).map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  void onSelectConversation(conversation.id)
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'left',
                  padding: '8px 0',
                  borderBottom: '0.5px solid rgba(138,106,58,0.2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--serif)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <div style={{ fontSize: 13, color: '#1a140c', fontWeight: 500 }}>{conversation.title ?? 'Untitled reflection'}</div>
                  <div style={{ fontSize: 10, color: '#8c7549', fontFamily: 'var(--mono)' }}>{formatDate(conversation.updatedAt)}</div>
                </div>
                <div style={{ fontSize: 11, color: '#4a3a20', fontStyle: 'italic', lineHeight: 1.4, marginTop: 2 }}>
                  {(conversation.tags ?? []).map((tag) => tag.label).slice(0, 4).join(' · ')}
                </div>
              </button>
            ))
          )
        )}
      </div>
    </div>
  )
}

const sectionLabelStyle = {
  fontSize: 9,
  letterSpacing: '0.26em',
  textTransform: 'uppercase',
  color: '#8c7549',
  fontFamily: 'var(--mono)',
} as const

function smallActionButtonStyle(disabled: boolean, loading: boolean) {
  return {
    border: 'none',
    background: 'transparent',
    color: disabled ? 'rgba(140,117,73,0.45)' : '#8c7549',
    cursor: disabled || loading ? 'default' : 'pointer',
    fontFamily: 'var(--serif)',
    fontSize: 10,
    fontStyle: 'italic',
    padding: 0,
  } as const
}

function splitMemory(text: string | undefined) {
  if (!text?.trim()) return []
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*·]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
