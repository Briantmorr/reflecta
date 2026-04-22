'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ConversationList from '@/components/ConversationList'
import ChatInterface from '@/components/ChatInterface'
import PsycheGraph from '@/components/PsycheGraph'
import SettingsModal from '@/components/SettingsModal'
import { useSettings } from '@/lib/settings'
import { Conversation, ConversationListItem, Graph, Message, NodeContext, NodeInsights, NodeView } from '@/types'

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
  const [nodeInsights, setNodeInsights] = useState<NodeInsights | null>(null)
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false)
  const [nodeContext, setNodeContext] = useState<NodeContext | null>(null)
  const [isGeneratingContext, setIsGeneratingContext] = useState(false)
  const [isSavingContext, setIsSavingContext] = useState(false)
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

  const handleCreate = useCallback(() => {
    setActiveConversation(null)
    setStarterPrompt(DEFAULT_STARTER_QUESTION)
  }, [])

  const createConversationRecord = useCallback(async () => {
    const res = await fetch('/api/conversations', { method: 'POST' })
    if (!res.ok) return null
    return (await res.json()) as Conversation
  }, [])

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
      handleCreate()
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
      if (isSending) return
      setIsSending(true)
      setStarterPrompt(null)

      let conversationForSend = activeConversation
      let optimisticUserMsg: Message | null = null

      try {
        if (!conversationForSend) {
          const created = await createConversationRecord()
          if (!created) throw new Error('Failed to create conversation')
          conversationForSend = { ...created, messages: [], tags: [] }
          setActiveConversation(conversationForSend)
        }

        optimisticUserMsg = {
          id: `temp-${Date.now()}`,
          conversationId: conversationForSend.id,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
        }
        const optimisticMessage = optimisticUserMsg
        setActiveConversation((prev) =>
          prev ? { ...prev, messages: [...(prev.messages ?? []), optimisticMessage] } : prev
        )

        const res = await fetch(`/api/conversations/${conversationForSend.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        })
        if (!res.ok) throw new Error('Failed to send message')
        const data = await res.json()
        const optimisticMessageId = optimisticUserMsg.id

        // Replace optimistic message with the real pair
        setActiveConversation((prev) => {
          if (!prev) return prev
          const msgs = (prev.messages ?? []).filter((m) => m.id !== optimisticMessageId)
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
        const optimisticMessageId = optimisticUserMsg?.id
        // Roll back optimistic
        setActiveConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: optimisticMessageId
                  ? (prev.messages ?? []).filter((m) => m.id !== optimisticMessageId)
                  : (prev.messages ?? []),
              }
            : prev
        )
      } finally {
        setIsSending(false)
      }
    },
    [activeConversation, createConversationRecord, isSending, fetchConversations]
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

  const handleGenerateInsights = useCallback(async () => {
    if (isGeneratingInsights) return
    const targetIds = (nodeView?.nodes ?? [])
      .filter((node) => node.type !== 'user')
      .map((node) => node.nodeId)
    if (targetIds.length === 0) return

    setIsGeneratingInsights(true)
    try {
      const res = await fetch('/api/nodes/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: targetIds }),
      })
      if (!res.ok) throw new Error('Failed to generate insights')
      const data = (await res.json()) as {
        summary: string
        bullets: string[]
        generatedAt: string
        persisted: boolean
      }
      setNodeInsights({
        summary: data.summary,
        bullets: data.bullets,
        generatedAt: data.generatedAt,
      })
      if (data.persisted) {
        await fetchGraph()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsGeneratingInsights(false)
    }
  }, [fetchGraph, isGeneratingInsights, nodeView])

  const contextTargetNodeId = useMemo(() => {
    const nodes = nodeView?.nodes ?? []
    return nodes.length === 1 ? nodes[0].nodeId : null
  }, [nodeView])

  const handleGenerateContext = useCallback(async () => {
    if (!contextTargetNodeId || isGeneratingContext) return
    setIsGeneratingContext(true)
    try {
      const res = await fetch(`/api/nodes/${contextTargetNodeId}/context`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to generate context')
      const data = (await res.json()) as { context: string | null; updatedAt: string | null }
      if (data.context && data.updatedAt) {
        setNodeContext({ text: data.context, updatedAt: data.updatedAt })
      } else {
        setNodeContext(null)
      }
      await fetchGraph()
    } catch (err) {
      console.error(err)
    } finally {
      setIsGeneratingContext(false)
    }
  }, [contextTargetNodeId, fetchGraph, isGeneratingContext])

  const handleSaveContext = useCallback(
    async (text: string) => {
      if (!contextTargetNodeId || isSavingContext) return
      setIsSavingContext(true)
      try {
        const res = await fetch(`/api/nodes/${contextTargetNodeId}/context`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: text }),
        })
        if (!res.ok) throw new Error('Failed to save context')
        const data = (await res.json()) as { context: string | null; updatedAt: string | null }
        if (data.context && data.updatedAt) {
          setNodeContext({ text: data.context, updatedAt: data.updatedAt })
        } else {
          setNodeContext(null)
        }
        await fetchGraph()
      } catch (err) {
        console.error(err)
      } finally {
        setIsSavingContext(false)
      }
    },
    [contextTargetNodeId, fetchGraph, isSavingContext]
  )

  const handleSelectNode = useCallback(
    (nodeId: string | null, options?: { additive?: boolean }) => {
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

      const selectedNode = { nodeId: node.id, label: node.label, type: node.type }
      setNodeView((previous) => {
        const existingNodes = options?.additive ? previous?.nodes ?? [] : []
        const alreadySelected = existingNodes.some((candidate) => candidate.nodeId === node.id)
        const nextNodes = options?.additive && alreadySelected
          ? existingNodes.filter((candidate) => candidate.nodeId !== node.id)
          : options?.additive
            ? [...existingNodes, selectedNode]
            : [selectedNode]

        return nextNodes.length > 0 ? { nodes: nextNodes } : null
      })
      if (!options?.additive) {
        setStarterPrompt((currentStarter) => {
          if (activeConversation) return currentStarter
          return node.type === 'user' ? DEFAULT_STARTER_QUESTION : buildNodeStarterQuestion(node.label)
        })
      }
      openLeft()
    },
    [activeConversation, graph.nodes, openLeft]
  )

  useEffect(() => {
    if (nodeView) {
      setHighlightedNodeIds(nodeView.nodes.map((node) => node.nodeId))
      return
    }

    if (activeConversation?.tags?.length) {
      setHighlightedNodeIds(activeConversation.tags.map((tag) => tag.nodeId))
    } else {
      setHighlightedNodeIds([])
    }
  }, [activeConversation?.tags, nodeView])

  useEffect(() => {
    const selected = (nodeView?.nodes ?? []).filter((node) => node.type !== 'user')
    if (selected.length === 1) {
      const persisted = graph.nodes.find((node) => node.id === selected[0].nodeId)?.insights ?? null
      setNodeInsights(persisted ?? null)
      return
    }
    setNodeInsights(null)
  }, [graph.nodes, nodeView])

  useEffect(() => {
    const selected = nodeView?.nodes ?? []
    if (selected.length !== 1) {
      setNodeContext(null)
      return
    }

    let cancelled = false

    const persisted = graph.nodes.find((node) => node.id === selected[0].nodeId)?.context ?? null
    setNodeContext(persisted ?? null)

    async function loadNodeContext() {
      try {
        const res = await fetch(`/api/nodes/${selected[0].nodeId}/context`)
        if (!res.ok) throw new Error('Failed to fetch node context')
        const data = (await res.json()) as { context: string | null; updatedAt: string | null }
        if (cancelled) return
        if (data.context && data.updatedAt) {
          setNodeContext({ text: data.context, updatedAt: data.updatedAt })
        } else {
          setNodeContext(null)
        }
      } catch (err) {
        console.error(err)
      }
    }

    void loadNodeContext()

    return () => {
      cancelled = true
    }
  }, [graph.nodes, nodeView])

  const selectedFilterNodeIds =
    nodeView?.nodes.filter((node) => node.type !== 'user').map((node) => node.nodeId) ?? []
  const selectedNodeIds = useMemo(
    () => nodeView?.nodes.map((node) => node.nodeId) ?? [],
    [nodeView]
  )

  const visibleConversations = selectedFilterNodeIds.length > 0
    ? conversations.filter((conversation) =>
        (conversation.tags ?? []).some((tag) => selectedFilterNodeIds.includes(tag.nodeId))
      )
    : conversations

  return (
    <main
      className="flex h-screen overflow-hidden"
      style={{ background: 'var(--mirror-bg)' }}
    >
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
        side="left"
      />
      <PsycheGraph
        graph={graph}
        highlightedNodeIds={highlightedNodeIds}
        selectedNodeIds={selectedNodeIds}
        onSelectNode={handleSelectNode}
        layout="primary"
      />
      <ConversationList
        conversations={visibleConversations}
        activeConversationId={activeConversation?.id ?? null}
        onSelect={handleSelect}
        onDelete={handleDelete}
        nodeView={nodeView}
        onClearNodeView={() => handleSelectNode(null)}
        nodeInsights={nodeInsights}
        onGenerateInsights={handleGenerateInsights}
        isGeneratingInsights={isGeneratingInsights}
        nodeContext={nodeContext}
        onGenerateContext={handleGenerateContext}
        onSaveContext={handleSaveContext}
        isGeneratingContext={isGeneratingContext}
        isSavingContext={isSavingContext}
        side="right"
      />
      <SettingsModal />
    </main>
  )
}
