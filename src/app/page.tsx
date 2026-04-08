'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Navigator from '@/components/Navigator'
import Editor from '@/components/Editor'
import Preview from '@/components/Preview'
import { JournalEntry, EntryListItem, EntryQuestion } from '@/types'

export default function Home() {
  const [entries, setEntries] = useState<EntryListItem[]>([])
  const [activeEntry, setActiveEntry] = useState<JournalEntry | null>(null)
  const [isNewEntry, setIsNewEntry] = useState(false)
  const [savedEntry, setSavedEntry] = useState<JournalEntry | null>(null)
  const [questions, setQuestions] = useState<EntryQuestion[]>([])
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false)
  const [questionsError, setQuestionsError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Track the last saved entry id to avoid re-generating questions unnecessarily
  const lastQuestionsEntryId = useRef<string | null>(null)

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/entries')
      if (!res.ok) throw new Error('Failed to fetch entries')
      const data: EntryListItem[] = await res.json()
      setEntries(data)
    } catch (err) {
      console.error('Failed to fetch entries:', err)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleNewEntry = useCallback(() => {
    setActiveEntry(null)
    setIsNewEntry(true)
    setHasUnsavedChanges(false)
  }, [])

  const handleSelectEntry = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/entries/${id}`)
      if (!res.ok) throw new Error('Failed to fetch entry')
      const entry: JournalEntry = await res.json()

      setActiveEntry(entry)
      setIsNewEntry(false)
      setHasUnsavedChanges(false)
      setSavedEntry(entry)

      // Load existing questions for this entry
      if (entry.questions && entry.questions.length > 0) {
        setQuestions(entry.questions)
        setQuestionsError(null)
        lastQuestionsEntryId.current = entry.id
      } else {
        setQuestions([])
        setQuestionsError(null)
      }
    } catch (err) {
      console.error('Failed to load entry:', err)
    }
  }, [])

  const handleDeleteEntry = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/entries/${id}`, { method: 'DELETE' })
        await fetchEntries()

        if (activeEntry?.id === id) {
          setActiveEntry(null)
          setIsNewEntry(false)
          setHasUnsavedChanges(false)
        }
        if (savedEntry?.id === id) {
          setSavedEntry(null)
          setQuestions([])
          setQuestionsError(null)
        }
      } catch (err) {
        console.error('Failed to delete entry:', err)
      }
    },
    [activeEntry?.id, savedEntry?.id, fetchEntries]
  )

  const handleSave = useCallback(
    async (content: string, entryId?: string) => {
      if (isSaving) return
      setIsSaving(true)

      try {
        let saved: JournalEntry

        if (entryId) {
          const res = await fetch(`/api/entries/${entryId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          })
          if (!res.ok) throw new Error('Failed to update entry')
          saved = await res.json()
        } else {
          const res = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          })
          if (!res.ok) throw new Error('Failed to create entry')
          saved = await res.json()
        }

        setActiveEntry(saved)
        setSavedEntry(saved)
        setIsNewEntry(false)
        setHasUnsavedChanges(false)
        await fetchEntries()

        // Generate questions (non-blocking)
        setIsGeneratingQuestions(true)
        setQuestionsError(null)
        setQuestions([])
        lastQuestionsEntryId.current = saved.id

        fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId: saved.id }),
        })
          .then(async (res) => {
            const data = await res.json()
            if (!res.ok) {
              setQuestionsError(data.error ?? 'Could not generate questions.')
            } else {
              setQuestions(data.questions ?? [])
            }
          })
          .catch(() => {
            setQuestionsError('Could not reach the AI. Check your API key.')
          })
          .finally(() => {
            setIsGeneratingQuestions(false)
          })
      } catch (err) {
        console.error('Failed to save:', err)
      } finally {
        setIsSaving(false)
      }
    },
    [isSaving, fetchEntries]
  )

  const handleContentChange = useCallback(() => {
    setHasUnsavedChanges(true)
  }, [])

  return (
    <main
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--journal-bg)' }}
    >
      <Navigator
        entries={entries}
        activeEntryId={activeEntry?.id ?? null}
        onSelectEntry={handleSelectEntry}
        onNewEntry={handleNewEntry}
        onDeleteEntry={handleDeleteEntry}
      />

      <Editor
        entry={activeEntry}
        isNewEntry={isNewEntry}
        isSaving={isSaving}
        hasUnsavedChanges={hasUnsavedChanges}
        onSave={handleSave}
        onContentChange={handleContentChange}
      />

      <Preview
        entry={savedEntry}
        questions={questions}
        isGeneratingQuestions={isGeneratingQuestions}
        questionsError={questionsError}
      />
    </main>
  )
}
