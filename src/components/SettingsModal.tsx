'use client'

import { useEffect, useState } from 'react'
import { FileText, Moon, Settings2, Sun, X } from 'lucide-react'
import { Theme, useSettings } from '@/lib/settings'
import PromptEditor from '@/components/PromptEditor'

const THEME_OPTIONS: Array<{
  value: Theme
  label: string
  icon: typeof Sun
  description: string
}> = [
  {
    value: 'dark',
    label: 'Dark',
    icon: Moon,
    description: 'Low-glare surfaces with warm contrast.',
  },
  {
    value: 'light',
    label: 'Light',
    icon: Sun,
    description: 'Soft paper tones with brighter panels.',
  },
]

export default function SettingsModal() {
  const [activeTab, setActiveTab] = useState<'appearance' | 'prompts'>('appearance')
  const {
    theme,
    setTheme,
    settingsOpen,
    closeSettings,
  } = useSettings()

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
        className={`w-full rounded-[28px] p-6 shadow-2xl ${activeTab === 'prompts' ? 'max-w-6xl' : 'max-w-md'}`}
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
              {activeTab === 'prompts' ? 'Prompt editor' : 'Appearance and layout'}
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              {activeTab === 'prompts'
                ? 'Edit readable prompt text, save versions, and activate changes for future LLM calls.'
                : 'Tune the workspace without leaving the conversation.'}
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
            onClick={() => setActiveTab('appearance')}
            className="mirror-focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            style={{
              background: activeTab === 'appearance' ? 'var(--mirror-surface)' : 'transparent',
              color: activeTab === 'appearance' ? 'var(--mirror-text)' : 'var(--mirror-muted)',
            }}
          >
            <Sun size={13} />
            Appearance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('prompts')}
            className="mirror-focus-ring flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-medium"
            style={{
              background: activeTab === 'prompts' ? 'var(--mirror-surface)' : 'transparent',
              color: activeTab === 'prompts' ? 'var(--mirror-text)' : 'var(--mirror-muted)',
            }}
          >
            <FileText size={13} />
            Prompt editor
          </button>
        </div>

        {activeTab === 'appearance' ? (
          <section className="mb-6">
            <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--mirror-secondary)' }}>
              Theme
            </div>
            <div className="grid grid-cols-2 gap-3">
              {THEME_OPTIONS.map((option) => {
                const Icon = option.icon
                const isActive = theme === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    className="mirror-focus-ring rounded-2xl p-4 text-left transition-all"
                    style={{
                      background: isActive ? 'var(--mirror-accent-subtle)' : 'var(--mirror-elevated)',
                      border: `1px solid ${isActive ? 'var(--mirror-accent)' : 'var(--mirror-border)'}`,
                    }}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <div
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{
                          background: isActive ? 'var(--mirror-accent)' : 'var(--mirror-bg)',
                          color: isActive ? 'var(--mirror-accent-contrast)' : 'var(--mirror-secondary)',
                        }}
                      >
                        <Icon size={15} />
                      </div>
                      <span className="text-sm font-medium" style={{ color: 'var(--mirror-text)' }}>
                        {option.label}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                      {option.description}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        ) : (
          <PromptEditor />
        )}
      </div>
    </div>
  )
}
