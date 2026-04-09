'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

export type Theme = 'dark' | 'light'

export interface Settings {
  theme: Theme
  leftCollapsed: boolean
  rightCollapsed: boolean
  settingsOpen: boolean
}

interface SettingsContextValue extends Settings {
  setTheme: (theme: Theme) => void
  toggleLeft: () => void
  toggleRight: () => void
  openSettings: () => void
  closeSettings: () => void
}

const STORAGE_KEY = 'mirror:settings'

// Left pane starts collapsed, right pane starts open, dark theme default.
const DEFAULTS: Settings = {
  theme: 'dark',
  leftCollapsed: true,
  rightCollapsed: false,
  settingsOpen: false,
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

function readStoredSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      leftCollapsed: parsed.leftCollapsed ?? DEFAULTS.leftCollapsed,
      rightCollapsed: parsed.rightCollapsed ?? DEFAULTS.rightCollapsed,
      settingsOpen: false, // never persist modal state
    }
  } catch {
    return DEFAULTS
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // Start with defaults to match SSR — hydrate from localStorage in useEffect
  const [settings, setSettings] = useState<Settings>(DEFAULTS)

  // Hydrate from localStorage after mount, then apply the theme
  useEffect(() => {
    const stored = readStoredSettings()
    setSettings(stored)
    applyTheme(stored.theme)
  }, [])

  // Persist whenever non-modal settings change
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          theme: settings.theme,
          leftCollapsed: settings.leftCollapsed,
          rightCollapsed: settings.rightCollapsed,
        })
      )
    } catch {
      // ignore quota / availability errors
    }
  }, [settings.theme, settings.leftCollapsed, settings.rightCollapsed])

  const setTheme = useCallback((theme: Theme) => {
    applyTheme(theme)
    setSettings((s) => ({ ...s, theme }))
  }, [])

  const toggleLeft = useCallback(() => {
    setSettings((s) => ({ ...s, leftCollapsed: !s.leftCollapsed }))
  }, [])

  const toggleRight = useCallback(() => {
    setSettings((s) => ({ ...s, rightCollapsed: !s.rightCollapsed }))
  }, [])

  const openSettings = useCallback(() => {
    setSettings((s) => ({ ...s, settingsOpen: true }))
  }, [])

  const closeSettings = useCallback(() => {
    setSettings((s) => ({ ...s, settingsOpen: false }))
  }, [])

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      setTheme,
      toggleLeft,
      toggleRight,
      openSettings,
      closeSettings,
    }),
    [settings, setTheme, toggleLeft, toggleRight, openSettings, closeSettings]
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within a <SettingsProvider>')
  }
  return ctx
}
