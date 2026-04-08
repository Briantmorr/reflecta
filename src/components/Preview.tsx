'use client'

import { Eye, Sparkles, Loader2, MessageCircle } from 'lucide-react'
import { JournalEntry, EntryQuestion } from '@/types'
import { formatEntryDate } from '@/lib/utils'

interface PreviewProps {
  entry: JournalEntry | null
  questions: EntryQuestion[]
  isGeneratingQuestions: boolean
  questionsError: string | null
}

export default function Preview({
  entry,
  questions,
  isGeneratingQuestions,
  questionsError,
}: PreviewProps) {
  if (!entry) {
    return (
      <aside
        className="flex flex-col items-center justify-center h-screen"
        style={{
          width: '340px',
          flexShrink: 0,
          background: 'var(--journal-pane)',
          borderLeft: '1px solid var(--journal-border)',
        }}
      >
        <div className="text-center space-y-3 px-8">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'var(--journal-elevated)' }}
          >
            <Eye size={20} style={{ color: 'var(--journal-muted)' }} />
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--journal-muted)' }}>
            Save an entry to see a preview and receive AI-generated reflection questions.
          </p>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className="flex flex-col h-screen overflow-hidden"
      style={{
        width: '340px',
        flexShrink: 0,
        background: 'var(--journal-pane)',
        borderLeft: '1px solid var(--journal-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--journal-border)',
          background: 'var(--journal-nav)',
        }}
      >
        <div className="flex items-center gap-2">
          <Eye size={13} style={{ color: 'var(--journal-secondary)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--journal-secondary)' }}>
            Preview
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--journal-muted)' }}>
          {formatEntryDate(entry.updatedAt)}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Rendered entry */}
        <div className="px-5 py-6">
          <div
            className="prose-journal"
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />
        </div>

        {/* Divider */}
        <div
          className="mx-5 mb-6"
          style={{ height: '1px', background: 'var(--journal-border)' }}
        />

        {/* Reflection Questions */}
        <div className="px-5 pb-8">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles size={13} style={{ color: 'var(--journal-accent)' }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--journal-accent)', letterSpacing: '0.1em' }}
            >
              Reflection Questions
            </span>
          </div>

          {isGeneratingQuestions && (
            <div className="flex items-center gap-2 py-4">
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--journal-accent)' }} />
              <span className="text-xs" style={{ color: 'var(--journal-secondary)' }}>
                Generating questions…
              </span>
            </div>
          )}

          {questionsError && !isGeneratingQuestions && (
            <div
              className="rounded-lg p-3 text-xs leading-relaxed"
              style={{
                background: 'rgba(248,113,113,0.06)',
                color: '#f87171',
                border: '1px solid rgba(248,113,113,0.15)',
              }}
            >
              {questionsError}
            </div>
          )}

          {!isGeneratingQuestions && !questionsError && questions.length === 0 && (
            <p className="text-xs" style={{ color: 'var(--journal-muted)' }}>
              No questions generated yet.
            </p>
          )}

          {!isGeneratingQuestions && questions.length > 0 && (
            <ol className="space-y-4">
              {questions.map((q, i) => (
                <li key={q.id}>
                  <div
                    className="rounded-xl p-4"
                    style={{
                      background: 'var(--journal-elevated)',
                      border: '1px solid var(--journal-border)',
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5 text-xs font-bold"
                        style={{
                          background: 'var(--journal-accent-dim)',
                          color: 'var(--journal-accent)',
                        }}
                      >
                        {i + 1}
                      </div>
                      <p
                        className="text-sm leading-relaxed flex-1"
                        style={{ color: 'var(--journal-text)', fontFamily: 'Georgia, serif' }}
                      >
                        {q.text}
                      </p>
                    </div>
                    <div className="mt-3 ml-8">
                      <textarea
                        placeholder="Your reflection…"
                        rows={2}
                        className="w-full resize-none text-xs rounded-lg px-3 py-2 outline-none transition-colors"
                        style={{
                          background: 'var(--journal-pane)',
                          border: '1px solid var(--journal-border)',
                          color: 'var(--journal-text)',
                          caretColor: 'var(--journal-accent)',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--journal-accent-dim)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--journal-border)'
                        }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <div
        className="px-4 py-3 flex items-center gap-1.5 flex-shrink-0"
        style={{ borderTop: '1px solid var(--journal-border)' }}
      >
        <MessageCircle size={11} style={{ color: 'var(--journal-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--journal-muted)' }}>
          Questions refresh on each save
        </span>
      </div>
    </aside>
  )
}
