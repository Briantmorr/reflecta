'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import Underline from '@tiptap/extension-underline'
import {
  Bold,
  Italic,
  UnderlineIcon,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Minus,
  Save,
  FileEdit,
  Loader2,
} from 'lucide-react'
import { JournalEntry } from '@/types'

interface EditorProps {
  entry: JournalEntry | null
  isNewEntry: boolean
  isSaving: boolean
  hasUnsavedChanges: boolean
  onSave: (content: string, entryId?: string) => Promise<void>
  onContentChange: () => void
}

interface ToolbarButtonProps {
  onClick: () => void
  active?: boolean
  title: string
  children: React.ReactNode
}

function ToolbarButton({ onClick, active, title, children }: ToolbarButtonProps) {
  return (
    <button
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      title={title}
      className="flex items-center justify-center rounded transition-colors"
      style={{
        width: '28px',
        height: '28px',
        background: active ? 'var(--journal-accent-dim)' : 'transparent',
        color: active ? 'var(--journal-accent)' : 'var(--journal-secondary)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--journal-elevated)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function ToolbarDivider() {
  return (
    <div
      className="h-4 mx-0.5"
      style={{ width: '1px', background: 'var(--journal-border)' }}
    />
  )
}

export default function Editor({
  entry,
  isNewEntry,
  isSaving,
  hasUnsavedChanges,
  onSave,
  onContentChange,
}: EditorProps) {
  const prevEntryId = useRef<string | null | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "What's on your mind today\u2026",
      }),
      CharacterCount,
      Underline,
    ],
    content: '',
    onUpdate: () => {
      onContentChange()
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
        spellcheck: 'true',
      },
    },
  })

  // Sync editor content when entry changes (by id)
  useEffect(() => {
    if (!editor) return
    const incomingId = entry?.id ?? null

    if (prevEntryId.current === incomingId) return
    prevEntryId.current = incomingId

    if (entry) {
      editor.commands.setContent(entry.content, false)
    } else if (isNewEntry) {
      editor.commands.clearContent(false)
    }
  }, [editor, entry?.id, isNewEntry])

  // Cmd+S / Ctrl+S keyboard shortcut
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (editor) onSave(editor.getHTML(), entry?.id)
      }
    },
    [editor, entry?.id, onSave]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  const handleSaveClick = () => {
    if (editor) onSave(editor.getHTML(), entry?.id)
  }

  const words = editor?.storage.characterCount?.words() ?? 0
  const chars = editor?.storage.characterCount?.characters() ?? 0

  // Empty state
  if (!isNewEntry && !entry) {
    return (
      <div
        className="flex flex-col items-center justify-center flex-1 h-screen"
        style={{ background: 'var(--journal-pane)' }}
      >
        <div className="text-center space-y-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'var(--journal-elevated)' }}
          >
            <FileEdit size={20} style={{ color: 'var(--journal-muted)' }} />
          </div>
          <p className="text-sm" style={{ color: 'var(--journal-muted)' }}>
            Select an entry to edit,
            <br />
            or create a new one.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col flex-1 h-screen overflow-hidden"
      style={{ background: 'var(--journal-pane)' }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-0.5 px-4 py-2 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--journal-border)',
          background: 'var(--journal-nav)',
        }}
      >
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBold().run()}
          active={editor?.isActive('bold')}
          title="Bold (⌘B)"
        >
          <Bold size={13} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleItalic().run()}
          active={editor?.isActive('italic')}
          title="Italic (⌘I)"
        >
          <Italic size={13} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
          active={editor?.isActive('underline')}
          title="Underline (⌘U)"
        >
          <UnderlineIcon size={13} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor?.isActive('heading', { level: 1 })}
          title="Heading 1"
        >
          <Heading1 size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor?.isActive('heading', { level: 2 })}
          title="Heading 2"
        >
          <Heading2 size={14} />
        </ToolbarButton>

        <ToolbarDivider />

        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
          active={editor?.isActive('bulletList')}
          title="Bullet list"
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          active={editor?.isActive('orderedList')}
          title="Numbered list"
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
          active={editor?.isActive('blockquote')}
          title="Blockquote"
        >
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          title="Horizontal rule"
        >
          <Minus size={14} />
        </ToolbarButton>
      </div>

      {/* Writing area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-10">
          {/* Date header */}
          {entry && (
            <p className="text-xs mb-6 font-medium" style={{ color: 'var(--journal-muted)' }}>
              {new Date(entry.createdAt).toLocaleDateString([], {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          )}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-6 py-3 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--journal-border)',
          background: 'var(--journal-nav)',
        }}
      >
        <div className="flex items-center gap-4">
          <span className="text-xs" style={{ color: 'var(--journal-muted)' }}>
            {words.toLocaleString()} words
          </span>
          <span className="text-xs" style={{ color: 'var(--journal-muted)' }}>
            {chars.toLocaleString()} chars
          </span>
          {hasUnsavedChanges && (
            <span
              className="text-xs flex items-center gap-1"
              style={{ color: 'var(--journal-accent)' }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--journal-accent)' }}
              />
              Unsaved
            </span>
          )}
        </div>

        <button
          onClick={handleSaveClick}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-medium transition-all"
          style={{
            background: isSaving ? 'var(--journal-elevated)' : 'var(--journal-accent)',
            color: isSaving ? 'var(--journal-muted)' : '#0f0d0b',
            cursor: isSaving ? 'not-allowed' : 'pointer',
          }}
        >
          {isSaving ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save size={12} />
              Save Entry
            </>
          )}
        </button>
      </div>
    </div>
  )
}
