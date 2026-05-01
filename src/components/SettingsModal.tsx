'use client'

import { useEffect } from 'react'
import { FileText, Settings2, X } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import PromptEditor from '@/components/PromptEditor'

export default function SettingsModal() {
  const { settingsOpen, closeSettings } = useSettings()

  useEffect(() => {
    if (!settingsOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSettings()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, closeSettings])

  useEffect(() => {
    if (!settingsOpen) return

    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [settingsOpen])

  if (!settingsOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 mirror-fade-in"
      style={{ background: 'var(--overlay-bg)' }}
      onClick={closeSettings}
    >
      <div
        className="w-full max-w-6xl rounded-[28px] p-6 shadow-2xl"
        style={{
          background: 'var(--mirror-pane)',
          border: '1px solid var(--mirror-border)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.22)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Settings2 size={15} style={{ color: 'var(--mirror-accent)' }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                style={{ color: 'var(--mirror-secondary)' }}
              >
                Settings
              </span>
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--mirror-text)' }}>
              Prompt editor
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              Edit readable prompt text, save versions, and activate changes for future LLM calls.
            </p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            className="mirror-focus-ring flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
            aria-label="Close settings"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-5 flex rounded-2xl border p-1" style={{ borderColor: 'var(--mirror-border)', background: 'var(--mirror-elevated)' }}>
          <button
            type="button"
            className="mirror-focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            style={{
              background: 'var(--mirror-surface)',
              color: 'var(--mirror-text)',
            }}
          >
            <FileText size={13} />
            Prompt editor
          </button>
        </div>

        <PromptEditor />
      </div>
    </div>
  )
}
