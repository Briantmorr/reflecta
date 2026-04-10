'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import ConversationList from '@/components/ConversationList'
import ChatInterface from '@/components/ChatInterface'
import PsycheGraph from '@/components/PsycheGraph'
import SettingsModal from '@/components/SettingsModal'
import { useSettings } from '@/lib/settings'
import { Conversation, ConversationListItem, Graph, Message, NodeView } from '@/types'

const DEFAULT_STARTER_QUESTION = "What's been on your mind lately?"
const NODE_STARTER_QUESTIONS: Record<string, string> = {
  self: "What part of yourself has been most present lately?",
  health: "How have you been feeling in your body or mind lately?",
  work: "What's been most alive for you at work lately?",
  relationships: "Who has been on your mind lately?",
  hobbies: "What have you been drawn toward or wanting more of lately?",
  lifestyle: "What rhythm or pattern in your daily life has been standing out lately?",
}

function buildNodeStarterQuestion(nodeLabel: string) {
  return NODE_STARTER_QUESTIONS[nodeLabel.toLowerCase()] ?? `What's been most present around ${nodeLabel.toLowerCase()} lately?`
}

export default function Home() {
  const { openLeft } = useSettings()
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] })
  const [starterPrompt, setStarterPrompt] = useState<string | null>(DEFAULT_STARTER_QUESTION)
  const [isSending, setIsSending] = useState(false)
  const [isUpdatingTags, setIsUpdatingTags] = useState(false)
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([])
  const [nodeView, setNodeView] = useState<NodeView | null>(null)
  const didAutoOpenConversation = useRef(false)

  // ─── Fetchers ──────────────────────────────────────────
  const fetchConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (res.ok) setConversations(await res.json())
  }, [])

  const fetchGraph = useCallback(async () => {
    const res = await fetch('/api/graph')
    if (res.ok) setGraph(await res.json())
  }, [])

  const fetchConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}`)
    if (!res.ok) return null
    return (await res.json()) as Conversation
  }, [])

  // ─── Handlers ──────────────────────────────────────────
  const handleSelect = useCallback(
    async (id: string) => {
      const convo = await fetchConversation(id)
      if (!convo) return
      setActiveConversation(convo)

      setStarterPrompt((convo.messages?.length ?? 0) === 0 ? DEFAULT_STARTER_QUESTION : null)

      setHighlightedNodeIds((convo.tags ?? []).map((tag) => tag.nodeId))
    },
    [fetchConversation]
  )

  const handleCreate = useCallback(async () => {
    const res = await fetch('/api/conversations', { method: 'POST' })
    if (!res.ok) return
    const created = await res.json()
    await fetchConversations()
    await handleSelect(created.id)
  }, [fetchConversations, handleSelect])

  // ─── Initial load ──────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function loadInitialState() {
      const [conversationRes] = await Promise.all([
        fetch('/api/conversations'),
        fetchGraph(),
      ])

      if (!conversationRes.ok || cancelled) return

      const initialConversations = (await conversationRes.json()) as ConversationListItem[]
      if (cancelled) return

      setConversations(initialConversations)

      if (initialConversations.length > 0) {
        didAutoOpenConversation.current = true
        await handleSelect(initialConversations[0].id)
        return
      }

      if (didAutoOpenConversation.current) return
      didAutoOpenConversation.current = true
      await handleCreate()
    }

    void loadInitialState()

    return () => {
      cancelled = true
    }
  }, [fetchGraph, handleCreate, handleSelect])

  const handleDelete = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (activeConversation?.id === id) {
        setActiveConversation(null)
        setStarterPrompt(DEFAULT_STARTER_QUESTION)
      }
      await fetchConversations()
      await fetchGraph()
    },
    [activeConversation?.id, fetchConversations, fetchGraph]
  )

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeConversation || isSending) return
      setIsSending(true)
      setStarterPrompt(null)

      // Optimistically add the user message
      const optimisticUserMsg: Message = {
        id: `temp-${Date.now()}`,
        conversationId: activeConversation.id,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      }
      setActiveConversation((prev) =>
        prev ? { ...prev, messages: [...(prev.messages ?? []), optimisticUserMsg] } : prev
      )

      try {
        const res = await fetch(`/api/conversations/${activeConversation.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        if (!res.ok) throw new Error('Failed to send message')
        const data = await res.json()

        // Replace optimistic message with the real pair
        setActiveConversation((prev) => {
          if (!prev) return prev
          const msgs = (prev.messages ?? []).filter((m) => m.id !== optimisticUserMsg.id)
          return {
            ...prev,
            messages: [...msgs, data.userMessage, data.assistantMessage],
          }
        })

        setGraph(data.graph)
        setHighlightedNodeIds(data.touchedNodeIds ?? [])
        await fetchConversations()
      } catch (err) {
        console.error(err)
        // Roll back optimistic
        setActiveConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: (prev.messages ?? []).filter((m) => m.id !== optimisticUserMsg.id),
              }
            : prev
        )
      } finally {
        setIsSending(false)
      }
    },
    [activeConversation, isSending, fetchConversations]
  )

  const handleUpdateTags = useCallback(async () => {
    if (!activeConversation || isUpdatingTags) return
    setIsUpdatingTags(true)

    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}/tags`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to update tags')
      const data = await res.json()

      setActiveConversation((prev) =>
        prev ? { ...prev, tags: data.tags } : prev
      )
      setGraph(data.graph)
      setHighlightedNodeIds(data.tags.map((tag: { nodeId: string }) => tag.nodeId))
      await fetchConversations()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdatingTags(false)
    }
  }, [activeConversation, fetchConversations, isUpdatingTags])

  const handleRemoveTag = useCallback(
    async (nodeId: string) => {
      if (!activeConversation) return

      try {
        const res = await fetch(`/api/conversations/${activeConversation.id}/tags`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId }),
        })
        if (!res.ok) throw new Error('Failed to remove tag')
        const data = await res.json()

        setActiveConversation((prev) =>
          prev ? { ...prev, tags: data.tags } : prev
        )
        setGraph(data.graph)
        setHighlightedNodeIds(data.tags.map((tag: { nodeId: string }) => tag.nodeId))
        await fetchConversations()
      } catch (err) {
        console.error(err)
      }
    },
    [activeConversation, fetchConversations]
  )

  const handleSelectNode = useCallback(
    (nodeId: string | null) => {
      if (!nodeId) {
        setNodeView(null)
        if (activeConversation?.tags?.length) {
          setHighlightedNodeIds(activeConversation.tags.map((tag) => tag.nodeId))
        } else {
          setHighlightedNodeIds([])
        }
        return
      }

      const node = graph.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return

      setNodeView({ nodeId: node.id, label: node.label, type: node.type })
      setHighlightedNodeIds([node.id])
      if (node.type !== 'user' && (activeConversation?.messages?.length ?? 0) === 0) {
        setStarterPrompt(buildNodeStarterQuestion(node.label))
      }
      openLeft()
    },
    [activeConversation?.messages?.length, activeConversation?.tags, graph.nodes, openLeft]
  )

  const visibleConversations = nodeView && nodeView.type !== 'user'
    ? conversations.filter((conversation) =>
        (conversation.tags ?? []).some((tag) => tag.nodeId === nodeView.nodeId)
      )
    : conversations

  return (
    <main
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--mirror-bg)' }}
    >
      <ConversationList
        conversations={visibleConversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelect={handleSelect}
        onCreate={handleCreate}
        onDelete={handleDelete}
        nodeView={nodeView}
        onClearNodeView={() => handleSelectNode(null)}
      />
      <PsycheGraph
        graph={graph}
        highlightedNodeIds={highlightedNodeIds}
        selectedNodeId={nodeView?.nodeId ?? null}
        onSelectNode={handleSelectNode}
        layout="primary"
      />
      <ChatInterface
        conversation={activeConversation}
        starterPrompt={starterPrompt}
        onCreateConversation={handleCreate}
        onSendMessage={handleSendMessage}
        isSending={isSending}
        onUpdateTags={handleUpdateTags}
        onRemoveTag={handleRemoveTag}
        isUpdatingTags={isUpdatingTags}
        layout="side"
      />
      <SettingsModal />
    </main>
  )
}
