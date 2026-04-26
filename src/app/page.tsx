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

type AssistantDraft = {
  content: string
  status: 'reading_context' | 'context_nodes' | 'streaming'
  nodeLabels: string[]
}

type MessageStreamEvent =
  | { type: 'status'; status: AssistantDraft['status'] }
  | { type: 'context_nodes'; nodes: Array<{ nodeId: string; label: string; reason: string }> }
  | { type: 'delta'; text: string }
  | { type: 'final'; userMessage: Message; assistantMessage: Message; graph: Graph; touchedNodeIds?: string[] }
  | { type: 'error'; error: string }

function buildNodeStarterQuestion(nodeLabel: string) {
  return NODE_STARTER_QUESTIONS[nodeLabel.toLowerCase()] ?? `What's been most present around ${nodeLabel.toLowerCase()} lately?`
}

async function readMessageStream(
  response: Response,
  { onEvent }: { onEvent: (event: MessageStreamEvent) => Promise<void> | void }
) {
  if (!response.body) throw new Error('Message stream missing response body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      await onEvent(JSON.parse(line) as MessageStreamEvent)
    }
  }

  if (buffer.trim()) {
    await onEvent(JSON.parse(buffer) as MessageStreamEvent)
  }
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
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraft | null>(null)
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
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? 'Failed to delete conversation')
      }

      setConversations((previous) => previous.filter((conversation) => conversation.id !== id))
      if (activeConversation?.id === id) {
        setActiveConversation(null)
        setStarterPrompt(DEFAULT_STARTER_QUESTION)
        setAssistantDraft(null)
      }
      await Promise.all([fetchConversations(), fetchGraph()])
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
        setAssistantDraft({ content: 'Reading context...', status: 'reading_context', nodeLabels: [] })

        const res = await fetch(`/api/conversations/${conversationForSend.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            selectedNodeIds: nodeView?.nodes.map((node) => node.nodeId) ?? [],
          }),
        })
        if (!res.ok) throw new Error('Failed to send message')
        const optimisticMessageId = optimisticUserMsg.id

        let finalReceived = false
        await readMessageStream(res, {
          onEvent: async (event) => {
            if (event.type === 'status') {
              setAssistantDraft((current) => ({
                content: current?.content || 'Reading context…',
                status: event.status,
                nodeLabels: current?.nodeLabels ?? [],
              }))
              return
            }

            if (event.type === 'context_nodes') {
              const labels = event.nodes.map((node) => node.label)
              setAssistantDraft({
                content: labels.length > 0 ? `Looking into ${labels.join(', ')}...` : 'Reading context...',
                status: 'context_nodes',
                nodeLabels: labels,
              })
              return
            }

            if (event.type === 'delta') {
              setAssistantDraft((current) => ({
                content:
                  current?.status === 'streaming'
                    ? `${current.content}${event.text}`
                    : event.text,
                status: 'streaming',
                nodeLabels: current?.nodeLabels ?? [],
              }))
              return
            }

            if (event.type === 'final') {
              finalReceived = true
              setActiveConversation((prev) => {
                if (!prev) return prev
                const msgs = (prev.messages ?? []).filter((m) => m.id !== optimisticMessageId)
                return {
                  ...prev,
                  messages: [...msgs, event.userMessage, event.assistantMessage],
                }
              })
              setAssistantDraft(null)
              setGraph(event.graph)
              setHighlightedNodeIds(event.touchedNodeIds ?? [])
              await fetchConversations()
              return
            }

            if (event.type === 'error') {
              throw new Error(event.error)
            }
          },
        })

        if (!finalReceived) throw new Error('Message stream ended before final event')
      } catch (err) {
        console.error(err)
        setAssistantDraft(null)
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
    [activeConversation, createConversationRecord, isSending, fetchConversations, nodeView]
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

  const handleRenameNode = useCallback(
    async (nodeId: string, label: string) => {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      })
      const data = (await res.json().catch(() => null)) as { label?: string; error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to rename node')
      }
      const nextLabel = data?.label ?? label

      setNodeView((previous) => {
        if (!previous) return previous
        return {
          nodes: previous.nodes.map((node) =>
            node.nodeId === nodeId ? { ...node, label: nextLabel } : node
          ),
        }
      })
      setActiveConversation((previous) => {
        if (!previous?.tags) return previous
        return {
          ...previous,
          tags: previous.tags.map((tag) =>
            tag.nodeId === nodeId ? { ...tag, label: nextLabel } : tag
          ),
        }
      })

      await Promise.all([fetchGraph(), fetchConversations()])
    },
    [fetchConversations, fetchGraph]
  )

  const handleDeleteNode = useCallback(
    async (nodeId: string) => {
      const res = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to delete node')
      }

      setNodeView(null)
      setNodeInsights(null)
      setNodeContext(null)
      setHighlightedNodeIds([])
      setActiveConversation((previous) => {
        if (!previous?.tags) return previous
        return {
          ...previous,
          tags: previous.tags.filter((tag) => tag.nodeId !== nodeId),
        }
      })

      await Promise.all([fetchGraph(), fetchConversations()])
    },
    [fetchConversations, fetchGraph]
  )

  const handleResetAppData = useCallback(async () => {
    const res = await fetch('/api/dev/reset', { method: 'POST' })
    const data = (await res.json().catch(() => null)) as { graph?: Graph; error?: string } | null
    if (!res.ok) {
      throw new Error(data?.error ?? 'Failed to reset app data')
    }

    setConversations([])
    setActiveConversation(null)
    setStarterPrompt(DEFAULT_STARTER_QUESTION)
    setNodeView(null)
    setNodeInsights(null)
    setNodeContext(null)
    setHighlightedNodeIds([])
    setAssistantDraft(null)
    if (data?.graph) {
      setGraph(data.graph)
    } else {
      await fetchGraph()
    }
  }, [fetchGraph])

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
        onDeleteConversation={handleDelete}
        isSending={isSending}
        onUpdateTags={handleUpdateTags}
        onRemoveTag={handleRemoveTag}
        isUpdatingTags={isUpdatingTags}
        assistantDraft={assistantDraft}
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
        onRenameNode={handleRenameNode}
        onDeleteNode={handleDeleteNode}
        onResetAppData={handleResetAppData}
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
