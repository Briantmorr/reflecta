'use client'

import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Conversation, ConversationListItem, Graph, Message } from '@/types'
import SettingsModal from '@/components/SettingsModal'
import { useSettings } from '@/lib/settings'
import { InkLine } from './InkLine'
import { InkNode } from './InkNode'
import { notebookLayout } from './layout'
import { NotebookSlip } from './NotebookSlip'
import { PaperFilters } from './PaperFilters'
import { PaperSheet } from './PaperSheet'
import { StickyNote } from './StickyNote'

const W = 1440
const H = 900
const PAGE_X = 40
const PAGE_Y = 28
const PAGE_W = W - PAGE_X * 2
const PAGE_H = H - PAGE_Y * 2
const MIN_GRAPH_ZOOM = 0.65
const MAX_GRAPH_ZOOM = 1.8

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

export function NotebookView() {
  const { openSettings } = useSettings()
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] })
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [activePaper, setActivePaper] = useState<'note' | 'slip'>('slip')
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraft | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isUpdatingMap, setIsUpdatingMap] = useState(false)
  const [isDeletingConversation, setIsDeletingConversation] = useState(false)
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null)
  const [nodeDeleteError, setNodeDeleteError] = useState<string | null>(null)
  const [buildingMemoryNodeId, setBuildingMemoryNodeId] = useState<string | null>(null)
  const [savingMemoryNodeId, setSavingMemoryNodeId] = useState<string | null>(null)
  const [memoryError, setMemoryError] = useState<string | null>(null)
  const [buildingInsightsNodeId, setBuildingInsightsNodeId] = useState<string | null>(null)
  const [frameSize, setFrameSize] = useState({ width: W, height: H })
  const [scale, setScale] = useState(1)
  const [graphViewport, setGraphViewport] = useState({ x: 0, y: 0, zoom: 1 })
  const graphViewportRef = useRef(graphViewport)
  const graphDragRef = useRef<{
    pointerId: number
    startClientX: number
    startClientY: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const suppressNodeClickRef = useRef(false)

  useEffect(() => {
    graphViewportRef.current = graphViewport
  }, [graphViewport])

  useEffect(() => {
    setNodeDeleteError(null)
  }, [selectedNodeId])

  const fetchConversations = useCallback(async () => {
    const res = await fetch('/api/conversations')
    if (res.ok) setConversations(await res.json())
  }, [])

  const fetchGraph = useCallback(async () => {
    const res = await fetch('/api/graph')
    if (res.ok) setGraph(await res.json())
  }, [])

  const createConversationRecord = useCallback(async () => {
    const res = await fetch('/api/conversations', { method: 'POST' })
    if (!res.ok) return null
    return (await res.json()) as Conversation
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [graphRes, conversationsRes] = await Promise.all([fetch('/api/graph'), fetch('/api/conversations')])
      if (cancelled) return
      if (graphRes.ok) {
        const nextGraph = (await graphRes.json()) as Graph
        setGraph(nextGraph)
        setSelectedNodeId((current) => current ?? nextGraph.nodes.find((node) => node.type === 'user')?.id ?? null)
      }
      if (conversationsRes.ok) setConversations(await conversationsRes.json())
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const updateScale = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      setFrameSize({ width, height })
      setScale(Math.min(width / W, height / H))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  const layout = useMemo(() => notebookLayout(graph, W, H, { cxFrac: 0.5, cyFrac: 0.54, scale: 1 }), [graph])
  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes])
  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null
  const focusSet = useMemo(() => buildFocusSet(graph, selectedNodeId, layout.userId), [graph, selectedNodeId, layout.userId])
  const now = new Date()
  const pageNumber = conversations.length + 42

  const handleSelectConversation = useCallback(async (conversationId: string) => {
    const res = await fetch(`/api/conversations/${conversationId}`)
    if (!res.ok) return
    const conversation = (await res.json()) as Conversation
    setAssistantDraft(null)
    setActiveConversation(conversation)
    setActivePaper('note')
  }, [])

  const handleNewConversation = useCallback(() => {
    setAssistantDraft(null)
    setActiveConversation(null)
    setActivePaper('note')
  }, [])

  const handleGraphPointerDown = useCallback((event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const current = graphViewportRef.current
    graphDragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: current.x,
      startY: current.y,
      moved: false,
    }
  }, [])

  const handleGraphPointerMove = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = graphDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = (event.clientX - drag.startClientX) / scale
    const dy = (event.clientY - drag.startClientY) / scale
    if (Math.hypot(dx, dy) > 3) drag.moved = true
    setGraphViewport((current) => ({
      ...current,
      x: drag.startX + dx,
      y: drag.startY + dy,
    }))
  }, [scale])

  const handleGraphPointerUp = useCallback((event: PointerEvent<SVGSVGElement>) => {
    const drag = graphDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    graphDragRef.current = null
    suppressNodeClickRef.current = drag.moved
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.moved) {
      setSelectedNodeId(null)
    }
  }, [])

  const zoomGraphBy = useCallback((delta: number) => {
    setGraphViewport((current) => ({
      ...current,
      zoom: clamp(current.zoom + delta, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM),
    }))
  }, [])

  const resetGraphViewport = useCallback(() => {
    setGraphViewport({ x: 0, y: 0, zoom: 1 })
  }, [])

  const handleUpdateMap = useCallback(async () => {
    if (!activeConversation || isUpdatingMap || (activeConversation.messages?.length ?? 0) === 0) return
    setIsUpdatingMap(true)

    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}/tags`, {
        method: 'POST',
      })
      const data = (await res.json().catch(() => null)) as {
        graph?: Graph
        tags?: Conversation['tags']
        error?: string
      } | null
      if (!res.ok) throw new Error(data?.error ?? 'Failed to update map')

      if (data?.graph) setGraph(data.graph)
      if (data?.tags) {
        setActiveConversation((current) => current ? { ...current, tags: data.tags } : current)
      }
      await fetchConversations()
    } catch (err) {
      console.error(err)
    } finally {
      setIsUpdatingMap(false)
    }
  }, [activeConversation, fetchConversations, isUpdatingMap])

  const handleDeleteConversation = useCallback(async () => {
    if (!activeConversation || isDeletingConversation || isSending || isUpdatingMap) return
    const confirmed = window.confirm('Are you sure? This will permanently delete this conversation.')
    if (!confirmed) return

    setIsDeletingConversation(true)
    try {
      const res = await fetch(`/api/conversations/${activeConversation.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? 'Failed to delete conversation')
      }
      setActiveConversation(null)
      setAssistantDraft(null)
      await Promise.all([fetchConversations(), fetchGraph()])
    } catch (err) {
      console.error(err)
    } finally {
      setIsDeletingConversation(false)
    }
  }, [activeConversation, fetchConversations, fetchGraph, isDeletingConversation, isSending, isUpdatingMap])

  const handleDeleteNode = useCallback(async (nodeId: string) => {
    if (deletingNodeId) return
    const node = nodeById.get(nodeId)
    if (!node || node.type === 'user' || node.type === 'domain') return

    setDeletingNodeId(nodeId)
    setNodeDeleteError(null)
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? 'Failed to delete node')

      setSelectedNodeId(null)
      setActiveConversation((current) =>
        current
          ? {
              ...current,
              tags: (current.tags ?? []).filter((tag) => tag.nodeId !== nodeId),
            }
          : current
      )
      await Promise.all([fetchGraph(), fetchConversations()])
    } catch (err) {
      console.error(err)
      setNodeDeleteError(err instanceof Error ? err.message : 'Failed to delete node')
    } finally {
      setDeletingNodeId(null)
    }
  }, [deletingNodeId, fetchConversations, fetchGraph, nodeById])

  const handleSendReflection = useCallback(
    async (content: string) => {
      if (isSending) return
      setIsSending(true)
      setActivePaper('note')

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
            selectedNodeIds: selectedNodeId ? [selectedNodeId] : [],
          }),
        })
        if (!res.ok) throw new Error('Failed to send message')

        const optimisticMessageId = optimisticUserMsg.id
        let finalReceived = false

        await readMessageStream(res, {
          onEvent: async (event) => {
            if (event.type === 'status') {
              setAssistantDraft((current) => ({
                content: current?.content || 'Reading context...',
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
                content: current?.status === 'streaming' ? `${current.content}${event.text}` : event.text,
                status: 'streaming',
                nodeLabels: current?.nodeLabels ?? [],
              }))
              return
            }

            if (event.type === 'final') {
              finalReceived = true
              setActiveConversation((prev) => {
                if (!prev) return prev
                const messages = (prev.messages ?? []).filter((message) => message.id !== optimisticMessageId)
                return {
                  ...prev,
                  messages: [...messages, event.userMessage, event.assistantMessage],
                  updatedAt: event.assistantMessage.createdAt,
                }
              })
              setAssistantDraft(null)
              setGraph(event.graph)
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
        setActiveConversation((prev) =>
          prev
            ? {
                ...prev,
                messages: optimisticMessageId
                  ? (prev.messages ?? []).filter((message) => message.id !== optimisticMessageId)
                  : (prev.messages ?? []),
              }
            : prev
        )
      } finally {
        setIsSending(false)
      }
    },
    [activeConversation, createConversationRecord, fetchConversations, isSending, selectedNodeId]
  )

  const handleBuildMemory = async (nodeId: string) => {
    if (buildingMemoryNodeId) return
    setBuildingMemoryNodeId(nodeId)
    setMemoryError(null)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/context`, { method: 'POST' })
      const data = (await res.json().catch(() => null)) as { context?: string | null; updatedAt?: string | null; error?: string } | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to build memory')
      }
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                context: data?.context && data.updatedAt ? { text: data.context, updatedAt: data.updatedAt } : null,
              }
            : node
        ),
      }))
    } catch (err) {
      console.error(err)
      setMemoryError(err instanceof Error ? err.message : 'Failed to build memory')
    } finally {
      setBuildingMemoryNodeId(null)
    }
  }

  const handleSaveMemory = async (nodeId: string, context: string) => {
    if (savingMemoryNodeId) return
    setSavingMemoryNodeId(nodeId)
    setMemoryError(null)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/context`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      })
      const data = (await res.json().catch(() => null)) as {
        context?: string | null
        updatedAt?: string | null
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to save memory')
      }
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                context: data?.context && data.updatedAt ? { text: data.context, updatedAt: data.updatedAt } : null,
              }
            : node
        ),
      }))
    } catch (err) {
      console.error(err)
      setMemoryError(err instanceof Error ? err.message : 'Failed to save memory')
      throw err
    } finally {
      setSavingMemoryNodeId(null)
    }
  }

  const handleBuildInsights = async (nodeId: string) => {
    if (buildingInsightsNodeId) return
    setBuildingInsightsNodeId(nodeId)
    try {
      const res = await fetch('/api/nodes/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: [nodeId] }),
      })
      const data = (await res.json().catch(() => null)) as {
        summary?: string
        bullets?: string[]
        generatedAt?: string
        error?: string
      } | null
      if (!res.ok) {
        throw new Error(data?.error ?? 'Failed to build insights')
      }
      if (!data?.summary || !data.generatedAt) return

      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                insights: {
                  summary: data.summary ?? '',
                  bullets: data.bullets ?? [],
                  generatedAt: data.generatedAt ?? new Date().toISOString(),
                },
              }
            : node
        ),
      }))
    } catch (err) {
      console.error(err)
    } finally {
      setBuildingInsightsNodeId(null)
    }
  }

  return (
    <main
      className="notebook-root fixed inset-0 h-screen w-screen overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, #cabd97 0%, #b8aa83 100%)',
      }}
    >
      <div className="flex h-screen w-screen items-center justify-center overflow-hidden">
        <div
          className="relative overflow-hidden"
          style={{
            width: frameSize.width,
            height: frameSize.height,
            border: 'none',
            boxShadow: 'none',
          }}
        >
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              width: W,
              height: H,
              transform: `translate(-50%, -50%) scale(${scale})`,
              transformOrigin: 'center',
            }}
          >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            width={W}
            height={H}
            style={{ display: 'block', position: 'absolute', inset: 0, cursor: graphDragRef.current ? 'grabbing' : 'grab' }}
            onPointerDown={handleGraphPointerDown}
            onPointerMove={handleGraphPointerMove}
            onPointerUp={handleGraphPointerUp}
            onPointerCancel={handleGraphPointerUp}
          >
            <PaperFilters />
            <rect width={W} height={H} fill="white" filter="url(#pg-grain)" opacity="0.35" />

            <PaperSheet x={PAGE_X} y={PAGE_Y} w={PAGE_W} h={PAGE_H} tint="#fbf3d9" side="br" earSize={74}>
              {[0.18, 0.5, 0.82].map((fraction) => (
                <circle key={fraction} cx="30" cy={PAGE_H * fraction} r="5" fill="#a38a50" opacity="0.3" />
              ))}
              {Array.from({ length: 4 }).map((_, index) => (
                <line key={index} x1="60" y1={58 + index * 30} x2={W - 136} y2={58 + index * 30} stroke="#7a6533" strokeWidth="0.35" opacity="0.32" />
              ))}
              {Array.from({ length: Math.floor((H - 240) / 44) }).map((_, index) => (
                <line key={`soft-${index}`} x1="60" y1={200 + index * 44} x2={W - 136} y2={200 + index * 44} stroke="#b39a5a" strokeWidth="0.3" opacity="0.12" />
              ))}
              <line x1="112" y1="40" x2="112" y2={180} stroke="#a23b1e" strokeWidth="0.6" opacity="0.6" />
            </PaperSheet>

            <g transform={`translate(${graphViewport.x} ${graphViewport.y}) scale(${graphViewport.zoom})`}>
              <line
                x1={layout.positions.get(layout.userId)?.x ?? W / 2}
                y1={(layout.positions.get(layout.userId)?.y ?? H / 2) - 240}
                x2={layout.positions.get(layout.userId)?.x ?? W / 2}
                y2={(layout.positions.get(layout.userId)?.y ?? H / 2) + 260}
                stroke="#a23b1e"
                strokeWidth="0.5"
                strokeDasharray="3 4"
                opacity="0.4"
              />

              {graph.edges.map((edge) => {
                const from = layout.positions.get(edge.fromId)
                const to = layout.positions.get(edge.toId)
                if (!from || !to) return null
                const hot = focusSet && focusSet.has(edge.fromId) && focusSet.has(edge.toId)
                const dim = focusSet && !hot
                return (
                  <g key={edge.id} opacity={dim ? 0.2 : 1}>
                    <InkLine x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={hot ? '#7a4a1e' : '#2a2318'} strokeWidth={hot ? 1.2 : 0.7} opacity={hot ? 0.9 : 0.6} />
                  </g>
                )
              })}

              {graph.nodes.map((node) => {
                const pos = layout.positions.get(node.id)
                if (!pos) return null
                const inFocus = !focusSet || focusSet.has(node.id)
                return (
                  <g key={node.id} opacity={inFocus ? 1 : 0.3}>
                    <InkNode
                      node={node}
                      pos={pos}
                      selected={selectedNodeId === node.id}
                      onClick={() => {
                        if (suppressNodeClickRef.current) {
                          suppressNodeClickRef.current = false
                          return
                        }
                        setSelectedNodeId(node.id)
                        setActivePaper('slip')
                      }}
                    />
                  </g>
                )
              })}
            </g>

            <g fontFamily="var(--serif)" fontStyle="italic" fontSize="12" fill="#6b5230">
              <text x="170" y="846">◉ you</text>
              <text x="230" y="846">○ theme</text>
              <text x="306" y="846">· person</text>
              <text x="384" y="846" fill="#a38a50">◌ dormant</text>
            </g>
            <text x="1320" y="860" textAnchor="end" fontFamily="var(--mono)" fontSize="11" fill="#8c7549">
              — {pageNumber} —
            </text>
            <text x="60" y="40" fontFamily="var(--serif)" fontSize="14" fill="#2a1f10" letterSpacing="0.08em" fontWeight="500" transform="rotate(-90 60 40) translate(-145 0)">
              MIRROR — vol. I
            </text>
          </svg>

          <div style={{ position: 'absolute', top: 58, left: 168, right: 180, color: '#1a140c' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 11, fontStyle: 'italic', color: '#6b5230', letterSpacing: '0.08em' }}>
                {formatNotebookDate(now)} · {timeOfDay(now)}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: '#8c7549' }}>entry no. {conversations.length}</div>
            </div>
            <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, margin: '8px 0 0', fontSize: 30, lineHeight: 1.1, fontStyle: 'italic', color: '#1a140c' }}>
              A map of your life, drawn from memory.
            </h1>
          </div>

          <UserProfileButton onClick={openSettings} />

          <GraphControls
            zoom={graphViewport.zoom}
            onZoomIn={() => zoomGraphBy(0.12)}
            onZoomOut={() => zoomGraphBy(-0.12)}
            onReset={resetGraphViewport}
          />

          <StickyNote
            active={activePaper === 'note'}
            zIndex={activePaper === 'note' ? 32 : 18}
            onActivate={() => setActivePaper('note')}
            messages={activeConversation?.messages ?? []}
            assistantDraft={assistantDraft}
            isSending={isSending}
            isUpdatingMap={isUpdatingMap}
            isDeleting={isDeletingConversation}
            canUpdateMap={!!activeConversation && (activeConversation.messages?.length ?? 0) > 0}
            canDelete={!!activeConversation}
            topic={selectedNode?.type === 'user' ? null : selectedNode?.label ?? null}
            onSendMessage={handleSendReflection}
            onNewConversation={handleNewConversation}
            onUpdateMap={handleUpdateMap}
            onDeleteConversation={handleDeleteConversation}
          />
          <MemoryTab
            label={selectedNode?.label ?? 'node memory'}
            active={activePaper === 'slip'}
            disabled={!selectedNode}
            onActivate={() => {
              if (selectedNode) setActivePaper('slip')
            }}
          />
          <NotebookSlip
            node={selectedNode}
            conversations={conversations}
            onBuildMemory={handleBuildMemory}
            onSaveMemory={handleSaveMemory}
            onBuildInsights={handleBuildInsights}
            onSelectConversation={handleSelectConversation}
            onDeleteNode={handleDeleteNode}
            isBuildingMemory={!!selectedNode && buildingMemoryNodeId === selectedNode.id}
            isSavingMemory={!!selectedNode && savingMemoryNodeId === selectedNode.id}
            memoryError={memoryError}
            isBuildingInsights={!!selectedNode && buildingInsightsNodeId === selectedNode.id}
            isDeletingNode={!!selectedNode && deletingNodeId === selectedNode.id}
            nodeDeleteError={nodeDeleteError}
            active={activePaper === 'slip'}
            zIndex={activePaper === 'slip' ? 32 : 18}
            onActivate={() => setActivePaper('slip')}
          />
          </div>
        </div>
      </div>
      <SettingsModal />
    </main>
  )
}

function UserProfileButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      style={{
        position: 'absolute',
        top: 18,
        left: 24,
        zIndex: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px 8px 9px',
        border: '0.5px solid rgba(122,90,40,0.22)',
        borderRadius: 999,
        background: 'rgba(254,248,230,0.74)',
        boxShadow: '0 12px 28px rgba(70,52,22,0.08)',
        color: '#2a2318',
        cursor: 'pointer',
        fontFamily: 'var(--serif)',
      }}
      aria-label="Open user profile and prompt editor"
      title="User profile and prompt editor"
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 999,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2a2318',
          color: '#fbf5e4',
          fontFamily: 'var(--mono)',
          fontSize: 11,
        }}
      >
        U
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.05 }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#8c7549' }}>
          user profile
        </span>
        <span style={{ marginTop: 3, fontSize: 12, fontStyle: 'italic', color: '#2a2318' }}>
          prompts
        </span>
      </span>
    </button>
  )
}

function GraphControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onReset,
}: {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}) {
  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        left: 168,
        bottom: 86,
        zIndex: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        borderRadius: 999,
        background: 'rgba(254,248,230,0.72)',
        border: '0.5px solid rgba(122,90,40,0.2)',
        boxShadow: '0 12px 28px rgba(70,52,22,0.08)',
        fontFamily: 'var(--mono)',
        color: '#6b5230',
      }}
    >
      <GraphControlButton label="-" title="Zoom out" onClick={onZoomOut} />
      <GraphControlButton label="+" title="Zoom in" onClick={onZoomIn} />
      <GraphControlButton label="[]" title="Reset view" onClick={onReset} />
      <span style={{ minWidth: 34, textAlign: 'right', fontSize: 9, letterSpacing: '0.08em' }}>
        {Math.round(zoom * 100)}%
      </span>
    </div>
  )
}

function GraphControlButton({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      style={{
        width: 26,
        height: 24,
        border: '0.5px solid rgba(122,90,40,0.22)',
        borderRadius: 999,
        background: 'rgba(251,245,228,0.8)',
        color: '#2a2318',
        cursor: 'pointer',
        fontFamily: 'var(--mono)',
        fontSize: 11,
        lineHeight: 1,
      }}
    >
      {label}
    </button>
  )
}

function buildFocusSet(graph: Graph, selectedNodeId: string | null, userId: string) {
  if (!selectedNodeId) return null
  const set = new Set<string>([userId, selectedNodeId])
  const adjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, new Set())
    if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, new Set())
    adjacency.get(edge.fromId)?.add(edge.toId)
    adjacency.get(edge.toId)?.add(edge.fromId)
  }
  for (const neighbor of adjacency.get(selectedNodeId) ?? []) set.add(neighbor)
  return set
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function MemoryTab({
  label,
  active,
  disabled,
  onActivate,
}: {
  label: string
  active: boolean
  disabled: boolean
  onActivate: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        event.stopPropagation()
        onActivate()
      }}
      style={{
        position: 'absolute',
        top: 124,
        right: 82,
        width: 250,
        height: 74,
        border: 'none',
        background: '#fef8e6',
        boxShadow: '0 18px 34px -22px rgba(50,30,10,0.42), 0 0 0 0.5px rgba(122,90,40,0.22)',
        transform: active ? 'rotate(-1.4deg) translateY(-4px)' : 'rotate(-1.4deg)',
        opacity: disabled ? 0.5 : active ? 1 : 0.88,
        cursor: disabled ? 'default' : 'pointer',
        zIndex: active ? 31 : 22,
        textAlign: 'left',
        padding: '13px 18px',
        fontFamily: 'var(--mono)',
        transition: 'transform 180ms ease, opacity 180ms ease',
      }}
      aria-label={disabled ? 'Select a node to open memory' : `Open memory for ${label}`}
      title={disabled ? 'Select a node to open memory' : `Open memory for ${label}`}
    >
      <div style={{ fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: '#8c7549' }}>
        what I remember
      </div>
      <div style={{ marginTop: 7, fontFamily: 'var(--serif)', fontSize: 18, fontStyle: 'italic', color: '#1a140c' }}>
        {disabled ? 'select a node' : label}
      </div>
    </button>
  )
}

function formatNotebookDate(date: Date) {
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' }).replace('.', '')
  const day = date.toLocaleDateString(undefined, { day: '2-digit' })
  const month = date.toLocaleDateString(undefined, { month: 'long' })
  return `${weekday}. ${day} ${month}`
}

function timeOfDay(date: Date) {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}
