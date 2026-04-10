'use client'

import { useEffect } from 'react'
import { Moon, PanelLeft, PanelRight, Settings2, Sun, X } from 'lucide-react'
import { Theme, useSettings } from '@/lib/settings'

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
  const {
    theme,
    setTheme,
    leftCollapsed,
    rightCollapsed,
    settingsOpen,
    toggleLeft,
    toggleRight,
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
        className="w-full max-w-md rounded-[28px] p-6 shadow-2xl"
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
              Appearance and layout
            </h2>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              Tune the workspace without leaving the conversation.
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

        <section>
          <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--mirror-secondary)' }}>
            Panels
          </div>
          <div className="space-y-3">
            <PanelToggle
              icon={PanelLeft}
              title="Conversation history"
              description="Collapsed by default for a quieter workspace."
              isCollapsed={leftCollapsed}
              onToggle={toggleLeft}
            />
            <PanelToggle
              icon={PanelRight}
              title="Conversation panel"
              description="Tuck the note and chat panel away to keep the map central."
              isCollapsed={rightCollapsed}
              onToggle={toggleRight}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

function PanelToggle({
  icon: Icon,
  title,
  description,
  isCollapsed,
  onToggle,
}: {
  icon: typeof PanelLeft
  title: string
  description: string
  isCollapsed: boolean
  onToggle: () => void
}) {
  return (
    <div
      className="flex items-center justify-between gap-4 rounded-2xl p-4"
      style={{
        background: 'var(--mirror-elevated)',
        border: '1px solid var(--mirror-border)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: 'var(--mirror-bg)', color: 'var(--mirror-secondary)' }}
        >
          <Icon size={15} />
        </div>
        <div>
          <div className="text-sm font-medium" style={{ color: 'var(--mirror-text)' }}>
            {title}
          </div>
          <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
            {description}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="mirror-focus-ring rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
        style={{
          background: isCollapsed ? 'var(--mirror-border)' : 'var(--mirror-accent)',
          color: isCollapsed ? 'var(--mirror-secondary)' : 'var(--mirror-accent-contrast)',
        }}
      >
        {isCollapsed ? 'Show' : 'Hide'}
      </button>
    </div>
  )
}
