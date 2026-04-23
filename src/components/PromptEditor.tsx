'use client'

import { useEffect, useMemo, useState } from 'react'

type PromptVersion = {
  id: string
  content: string
  label: string | null
  createdAt: string
  createdBy: string | null
}

type PromptState = {
  key: string
  label: string
  filename: string
  description: string
  activeVersionId: string | null
  activeSource: 'remote' | 'local' | 'fallback'
  content: string
  versions: PromptVersion[]
}

type PromptResponse = {
  remoteEnabled: boolean
  storageBackend: string
  prompts: PromptState[]
}

const SECRET_STORAGE_KEY = 'mirror:prompt-editor-secret'

export default function PromptEditor() {
  const [secret, setSecret] = useState('')
  const [draftSecret, setDraftSecret] = useState('')
  const [createdBy, setCreatedBy] = useState('')
  const [data, setData] = useState<PromptResponse | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [label, setLabel] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const stored = window.sessionStorage.getItem(SECRET_STORAGE_KEY) ?? ''
    setSecret(stored)
    setDraftSecret(stored)
  }, [])

  const selectedPrompt = useMemo(() => {
    return data?.prompts.find((prompt) => prompt.key === selectedKey) ?? data?.prompts[0] ?? null
  }, [data?.prompts, selectedKey])

  useEffect(() => {
    if (!selectedPrompt) return
    setSelectedKey(selectedPrompt.key)
    setContent(selectedPrompt.content)
    setLabel('')
  }, [selectedPrompt?.key])

  async function loadPrompts(nextSecret = secret) {
    if (!nextSecret) {
      setError('Enter the prompt editor secret.')
      return
    }

    setLoading(true)
    setError(null)
    setStatus(null)

    try {
      const response = await fetch('/api/dev/prompts', {
        headers: { 'x-prompt-editor-secret': nextSecret },
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Failed to load prompts')

      window.sessionStorage.setItem(SECRET_STORAGE_KEY, nextSecret)
      setSecret(nextSecret)
      setData(body as PromptResponse)
      setSelectedKey((current) => current ?? (body as PromptResponse).prompts[0]?.key ?? null)
      setStatus('Loaded prompt state.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prompts')
    } finally {
      setLoading(false)
    }
  }

  async function saveVersion() {
    if (!selectedPrompt || !content.trim()) return
    setSaving(true)
    setError(null)
    setStatus(null)

    try {
      const response = await fetch(`/api/dev/prompts/${selectedPrompt.key}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-prompt-editor-secret': secret,
        },
        body: JSON.stringify({ content, label, createdBy }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Failed to save prompt')

      setStatus('Saved and activated new prompt version.')
      await loadPrompts(secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prompt')
    } finally {
      setSaving(false)
    }
  }

  async function activateVersion(versionId: string) {
    if (!selectedPrompt) return
    setSaving(true)
    setError(null)
    setStatus(null)

    try {
      const response = await fetch(`/api/dev/prompts/${selectedPrompt.key}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-prompt-editor-secret': secret,
        },
        body: JSON.stringify({ versionId, updatedBy: createdBy }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error ?? 'Failed to activate version')

      setStatus('Activated prompt version.')
      await loadPrompts(secret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate version')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4">
      <div
        className="rounded-3xl border p-4"
        style={{ background: 'var(--mirror-surface)', borderColor: 'var(--mirror-border)' }}
      >
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--mirror-secondary)' }}>
              Editor secret
            </span>
            <input
              type="password"
              value={draftSecret}
              onChange={(event) => setDraftSecret(event.target.value)}
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--mirror-elevated)',
                borderColor: 'var(--mirror-border)',
                color: 'var(--mirror-text)',
              }}
              placeholder="Shared dev secret"
            />
          </label>
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--mirror-secondary)' }}>
              Editor name
            </span>
            <input
              value={createdBy}
              onChange={(event) => setCreatedBy(event.target.value)}
              className="w-full rounded-2xl border px-3 py-2 text-sm outline-none"
              style={{
                background: 'var(--mirror-elevated)',
                borderColor: 'var(--mirror-border)',
                color: 'var(--mirror-text)',
              }}
              placeholder="Optional"
            />
          </label>
          <button
            type="button"
            onClick={() => void loadPrompts(draftSecret)}
            disabled={loading}
            className="mirror-focus-ring rounded-full px-4 py-2 text-sm font-medium"
            style={{ background: 'var(--mirror-accent)', color: 'var(--mirror-accent-contrast)' }}
          >
            {loading ? 'Loading…' : 'Load prompts'}
          </button>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
          Saves create DB-backed prompt versions and activate the newest version. Local JSON prompts remain the fallback.
        </p>
        {data && (
          <p className="mt-2 text-xs" style={{ color: 'var(--mirror-muted)' }}>
            Remote prompts: {data.remoteEnabled ? 'enabled' : 'disabled'} · Storage: {data.storageBackend}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: '#f87171', color: '#b91c1c', background: 'rgba(248,113,113,0.08)' }}>
          {error}
        </div>
      )}
      {status && (
        <div className="rounded-2xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--mirror-accent-dim)', color: 'var(--mirror-accent-hover)', background: 'var(--mirror-accent-subtle)' }}>
          {status}
        </div>
      )}

      {data && selectedPrompt && (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">
            {data.prompts.map((prompt) => (
              <button
                key={prompt.key}
                type="button"
                onClick={() => {
                  setSelectedKey(prompt.key)
                  setContent(prompt.content)
                  setLabel('')
                }}
                className="mirror-focus-ring w-full rounded-2xl border p-3 text-left"
                style={{
                  background: prompt.key === selectedPrompt.key ? 'var(--mirror-accent-subtle)' : 'var(--mirror-surface)',
                  borderColor: prompt.key === selectedPrompt.key ? 'var(--mirror-accent)' : 'var(--mirror-border)',
                }}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
                  {prompt.label}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: 'var(--mirror-muted)' }}>
                  {prompt.activeSource} · {prompt.versions.length} versions
                </div>
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
                {selectedPrompt.label}
              </div>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                {selectedPrompt.description} Fallback file: <code>{selectedPrompt.filename}</code>
              </p>
            </div>

            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              className="min-h-[420px] w-full resize-y rounded-3xl border p-4 text-sm leading-relaxed outline-none"
              style={{
                background: 'var(--mirror-elevated)',
                borderColor: 'var(--mirror-border)',
                color: 'var(--mirror-text)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            />

            <div className="flex flex-wrap items-center gap-3">
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="min-w-[220px] flex-1 rounded-2xl border px-3 py-2 text-sm outline-none"
                style={{
                  background: 'var(--mirror-elevated)',
                  borderColor: 'var(--mirror-border)',
                  color: 'var(--mirror-text)',
                }}
                placeholder="Version label, optional"
              />
              <button
                type="button"
                onClick={() => void saveVersion()}
                disabled={saving || !content.trim()}
                className="mirror-focus-ring rounded-full px-4 py-2 text-sm font-medium"
                style={{
                  background: saving || !content.trim() ? 'var(--mirror-border)' : 'var(--mirror-accent)',
                  color: saving || !content.trim() ? 'var(--mirror-muted)' : 'var(--mirror-accent-contrast)',
                }}
              >
                {saving ? 'Saving…' : 'Save new version'}
              </button>
            </div>

            <div className="rounded-3xl border p-3" style={{ borderColor: 'var(--mirror-border)', background: 'var(--mirror-surface)' }}>
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--mirror-secondary)' }}>
                Versions
              </div>
              {selectedPrompt.versions.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
                  No remote versions yet. This prompt is using the local fallback.
                </p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {selectedPrompt.versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border px-3 py-2"
                      style={{ borderColor: 'var(--mirror-border)', background: 'var(--mirror-elevated)' }}
                    >
                      <button
                        type="button"
                        onClick={() => setContent(version.content)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-medium" style={{ color: 'var(--mirror-text)' }}>
                          {version.label || version.id}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--mirror-muted)' }}>
                          {version.createdAt || 'Unknown time'}{version.createdBy ? ` · ${version.createdBy}` : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => void activateVersion(version.id)}
                        disabled={saving || version.id === selectedPrompt.activeVersionId}
                        className="mirror-focus-ring rounded-full px-3 py-1.5 text-xs font-medium"
                        style={{
                          background: version.id === selectedPrompt.activeVersionId ? 'var(--mirror-accent-subtle)' : 'var(--mirror-surface)',
                          color: version.id === selectedPrompt.activeVersionId ? 'var(--mirror-accent)' : 'var(--mirror-secondary)',
                          border: '1px solid var(--mirror-border)',
                        }}
                      >
                        {version.id === selectedPrompt.activeVersionId ? 'Active' : 'Activate'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
