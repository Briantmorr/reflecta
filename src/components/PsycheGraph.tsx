'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Node as FlowNode,
  Edge as FlowEdge,
  ReactFlowInstance,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  NodeProps,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Brain,
  Users,
  User as UserIcon,
  Briefcase,
  Heart,
  Activity,
  type LucideIcon,
} from 'lucide-react'
import { Graph, NodeType } from '@/types'
import { useSettings } from '@/lib/settings'

interface PsycheGraphProps {
  graph: Graph
  highlightedNodeIds?: string[]
  selectedNodeIds?: string[]
  onSelectNode?: (nodeId: string | null, options?: { additive?: boolean }) => void
  layout?: 'side' | 'primary'
}

// ─── Custom node rendering ─────────────────────────────────
interface PsycheNodeData extends Record<string, unknown> {
  label: string
  type: NodeType
  mentionCount: number
  highlighted: boolean
  selected: boolean
  dormant: boolean
  question?: string
}

function PsycheNode({ data }: NodeProps) {
  const nodeData = data as PsycheNodeData
  const config = NODE_STYLES[nodeData.type]
  const Icon = config.icon
  const scale = 1 + Math.min(nodeData.mentionCount * 0.04, 0.24)
  const isDormant = nodeData.dormant
  const isSelected = nodeData.selected
  const shellClassName = `psyche-node-shell${isDormant ? ' is-dormant' : ''}${isSelected ? ' is-selected' : ''}`

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className={`group flex flex-col items-center gap-1.5 transition-all ${shellClassName}`}
        style={{
          transform: `scale(${scale})`,
          opacity: isDormant ? 0.72 : 1,
          filter: isSelected
            ? 'drop-shadow(0 22px 36px color-mix(in srgb, var(--mirror-accent) 34%, transparent))'
            : nodeData.highlighted
              ? 'drop-shadow(0 12px 24px var(--mirror-accent-subtle))'
            : 'none',
        }}
      >
        <div
          className="flex items-center justify-center rounded-full transition-all duration-200 group-hover:-translate-y-0.5"
          style={{
            width: config.size,
            height: config.size,
            background: isDormant ? 'var(--node-dormant-bg)' : config.bg,
            border: `${isSelected ? 2.75 : 1.5}px solid ${
              isSelected
                ? 'var(--mirror-accent-hover)'
                : nodeData.highlighted
                ? 'var(--mirror-accent)'
                : isDormant
                  ? 'var(--node-dormant-border)'
                  : config.border
            }`,
            color: isDormant ? 'var(--node-dormant-fg)' : config.fg,
            boxShadow: isSelected
              ? '0 0 0 7px color-mix(in srgb, var(--mirror-accent) 16%, transparent), 0 0 0 14px color-mix(in srgb, var(--mirror-accent) 8%, transparent), 0 16px 34px color-mix(in srgb, var(--mirror-accent) 18%, transparent)'
              : nodeData.highlighted
                ? '0 0 0 6px var(--mirror-accent-subtle)'
              : 'var(--node-shadow)',
          }}
        >
          <Icon size={config.iconSize} strokeWidth={1.9} />
        </div>
        <div
          className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] transition-all duration-200 group-hover:-translate-y-0.5"
          style={{
            color: isSelected
              ? 'var(--mirror-accent-hover)'
              : nodeData.highlighted
              ? 'var(--mirror-accent)'
              : isDormant
                ? 'var(--node-dormant-fg)'
                : 'var(--mirror-secondary)',
            background: isSelected
              ? 'color-mix(in srgb, var(--mirror-accent) 12%, var(--node-label-bg))'
              : isDormant
                ? 'var(--node-dormant-label-bg)'
                : 'var(--node-label-bg)',
            border: `1px solid ${
              isSelected
                ? 'color-mix(in srgb, var(--mirror-accent) 32%, var(--mirror-border))'
                : isDormant
                  ? 'var(--node-dormant-border)'
                  : 'var(--mirror-border)'
            }`,
            backdropFilter: 'blur(10px)',
            boxShadow: isSelected ? '0 8px 20px var(--mirror-accent-subtle)' : 'none',
          }}
        >
          {nodeData.label}
        </div>
        {nodeData.question && (
          <div
            className="pointer-events-none rounded-full px-2.5 py-1 text-[10px] italic opacity-0 transition-all duration-200 group-hover:translate-y-0.5 group-hover:opacity-100"
            style={{
              color: isDormant ? 'var(--node-dormant-fg)' : 'var(--mirror-secondary)',
              background: isDormant ? 'var(--node-dormant-label-bg)' : 'var(--node-label-bg)',
              border: `1px solid ${isDormant ? 'var(--node-dormant-border)' : 'var(--mirror-border)'}`,
              backdropFilter: 'blur(10px)',
            }}
          >
            {nodeData.question}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  )
}

const nodeTypes = { psyche: PsycheNode }
const PRIMARY_FIT_VIEW_OPTIONS = { padding: 0.08, maxZoom: 1.45 }
const SIDE_FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1.45 }

const DOMAIN_LAYOUT_ORDER = ['Self', 'Health', 'Work', 'Relationships', 'Hobbies', 'Lifestyle']
const HEX_DIRECTIONS = [
  { x: 0, y: -1 },
  { x: 0.866, y: -0.5 },
  { x: 0.866, y: 0.5 },
  { x: 0, y: 1 },
  { x: -0.866, y: 0.5 },
  { x: -0.866, y: -0.5 },
]

// ─── Visual styling per node type ─────────────────────────
const NODE_STYLES: Record<
  NodeType,
  {
    bg: string
    fg: string
    border: string
    icon: LucideIcon
    size: number
    iconSize: number
  }
> = {
  user: {
    bg: 'var(--node-user-bg)',
    fg: 'var(--node-user-fg)',
    border: 'var(--node-user-border)',
    icon: UserIcon,
    size: 56,
    iconSize: 22,
  },
  domain: {
    bg: 'var(--node-domain-bg)',
    fg: 'var(--node-domain-fg)',
    border: 'var(--node-domain-border)',
    icon: Brain,
    size: 42,
    iconSize: 18,
  },
  person: {
    bg: 'var(--node-person-bg)',
    fg: 'var(--node-person-fg)',
    border: 'var(--node-person-border)',
    icon: Users,
    size: 30,
    iconSize: 14,
  },
  role: {
    bg: 'var(--node-role-bg)',
    fg: 'var(--node-role-fg)',
    border: 'var(--node-role-border)',
    icon: Briefcase,
    size: 30,
    iconSize: 14,
  },
  emotion: {
    bg: 'var(--node-emotion-bg)',
    fg: 'var(--node-emotion-fg)',
    border: 'var(--node-emotion-border)',
    icon: Heart,
    size: 28,
    iconSize: 13,
  },
}

// ─── Layout algorithm: radial, user at center ─────────────
function computeLayout(graph: Graph) {
  const userNode = graph.nodes.find((n) => n.type === 'user')
  const userNodeId = userNode?.id ?? ''
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const domainNodes = [...graph.nodes.filter((n) => n.type === 'domain')].sort((a, b) => {
    return DOMAIN_LAYOUT_ORDER.indexOf(a.label) - DOMAIN_LAYOUT_ORDER.indexOf(b.label)
  })
  const nonDomainNonUser = graph.nodes.filter((n) => n.type !== 'domain' && n.type !== 'user')

  const positions = new Map<string, { x: number; y: number }>()

  positions.set(userNodeId, { x: 0, y: 0 })

  const domainRadius = 206
  if (domainNodes.length === 6) {
    domainNodes.forEach((domainNode, index) => {
      const dir = HEX_DIRECTIONS[index] ?? HEX_DIRECTIONS[0]
      positions.set(domainNode.id, {
        x: Math.round(dir.x * domainRadius),
        y: Math.round(dir.y * domainRadius),
      })
    })
  } else {
    domainNodes.forEach((d, i) => {
      const angle = (i / Math.max(domainNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
      positions.set(d.id, {
        x: Math.cos(angle) * domainRadius,
        y: Math.sin(angle) * domainRadius,
      })
    })
  }

  const adjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (edge.fromId === userNodeId || edge.toId === userNodeId) continue
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, new Set())
    if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, new Set())
    adjacency.get(edge.fromId)?.add(edge.toId)
    adjacency.get(edge.toId)?.add(edge.fromId)
  }

  const parentByNode = new Map<string, string>()
  const depthByNode = new Map<string, number>()
  const visited = new Set<string>([userNodeId, ...domainNodes.map((node) => node.id)])
  const queue = domainNodes.map((node) => node.id)

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue
    const currentDepth = depthByNode.get(currentId) ?? 1
    const neighbors = [...(adjacency.get(currentId) ?? [])].sort((leftId, rightId) => {
      const left = nodeById.get(leftId)
      const right = nodeById.get(rightId)
      const priority = { role: 0, person: 1, domain: 2, user: 3, emotion: 4 }
      return (priority[left?.type ?? 'person'] ?? 9) - (priority[right?.type ?? 'person'] ?? 9)
    })

    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue
      visited.add(neighborId)
      parentByNode.set(neighborId, currentId)
      depthByNode.set(neighborId, currentDepth + 1)
      queue.push(neighborId)
    }
  }

  const childrenByParent = new Map<string, string[]>()
  for (const [childId, parentId] of parentByNode.entries()) {
    const parentChildren = childrenByParent.get(parentId) ?? []
    parentChildren.push(childId)
    childrenByParent.set(parentId, parentChildren)
  }

  const getSortedDirections = (parentPos: { x: number; y: number }) => {
    const magnitude = Math.hypot(parentPos.x, parentPos.y) || 1
    const outward = { x: parentPos.x / magnitude, y: parentPos.y / magnitude }
    return [...HEX_DIRECTIONS].sort((left, right) => {
      const leftDot = left.x * outward.x + left.y * outward.y
      const rightDot = right.x * outward.x + right.y * outward.y
      return rightDot - leftDot
    })
  }

  const placeChildren = (parentId: string) => {
    const childIds = childrenByParent.get(parentId) ?? []
    if (childIds.length === 0) return

    const parentPos = positions.get(parentId)
    const parentNode = nodeById.get(parentId)
    if (!parentPos || !parentNode) return

    const directions = getSortedDirections(parentPos)
    const step = parentNode.type === 'domain' ? 108 : 78
    const ringGap = parentNode.type === 'domain' ? 58 : 44

    childIds.forEach((childId, index) => {
      const ring = Math.floor(index / directions.length)
      const direction = directions[index % directions.length] ?? directions[0]
      const distance = step + ring * ringGap
      const tangent = { x: -direction.y, y: direction.x }
      const tangentOffset = ring > 0 ? ((index % directions.length) - 2.5) * 6 : 0

      positions.set(childId, {
        x: Math.round(parentPos.x + direction.x * distance + tangent.x * tangentOffset),
        y: Math.round(parentPos.y + direction.y * distance + tangent.y * tangentOffset),
      })

      placeChildren(childId)
    })
  }

  domainNodes.forEach((domainNode) => placeChildren(domainNode.id))

  const orphanIds = nonDomainNonUser
    .map((node) => node.id)
    .filter((nodeId) => !positions.has(nodeId))

  const orphanRadius = 336
  orphanIds.forEach((id, index) => {
    const direction = HEX_DIRECTIONS[index % HEX_DIRECTIONS.length] ?? HEX_DIRECTIONS[0]
    const ring = Math.floor(index / HEX_DIRECTIONS.length)
    const distance = orphanRadius + ring * 42
    positions.set(id, {
      x: Math.round(direction.x * distance),
      y: Math.round(direction.y * distance),
    })
  })

  return positions
}

// ─── Main component ───────────────────────────────────────
export default function PsycheGraph({
  graph,
  highlightedNodeIds = [],
  selectedNodeIds = [],
  onSelectNode,
  layout = 'side',
}: PsycheGraphProps) {
  const { leftCollapsed, rightCollapsed } = useSettings()
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const flowInstanceRef = useRef<ReactFlowInstance | null>(null)
  const initialNodes = useMemo<FlowNode[]>(() => {
    const positions = computeLayout(graph)
    const selected = new Set(selectedNodeIds)
    const highlighted = new Set([...highlightedNodeIds, ...selectedNodeIds])

    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'psyche',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        mentionCount: n.mentionCount,
        highlighted: highlighted.has(n.id),
        selected: selected.has(n.id),
        dormant: Boolean(n.dormant),
        question: n.question,
      } satisfies PsycheNodeData,
    }))
  }, [graph, highlightedNodeIds, selectedNodeIds])

  const initialEdges = useMemo<FlowEdge[]>(() => {
    const highlighted = new Set(highlightedNodeIds)
    return graph.edges.map((e) => {
      const isHot = highlighted.has(e.fromId) && highlighted.has(e.toId)
      const isHovered = hoveredNodeId !== null && (e.fromId === hoveredNodeId || e.toId === hoveredNodeId)
      const fromNode = graph.nodes.find((node) => node.id === e.fromId)
      const toNode = graph.nodes.find((node) => node.id === e.toId)
      const isDormantEdge = Boolean(fromNode?.dormant || toNode?.dormant)
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: 'smoothstep',
        pathOptions: { borderRadius: 22, offset: 10 },
        style: {
          stroke:
            isHot || isHovered ? 'var(--mirror-accent)' : 'var(--node-edge-stroke)',
          strokeWidth: isHot ? 2.25 : isHovered ? 1.9 : isDormantEdge ? 1.1 : 1.35,
          opacity: isHot ? 0.96 : isHovered ? 0.8 : isDormantEdge ? 0.28 : 0.56,
        },
        animated: false,
      }
    })
  }, [graph, highlightedNodeIds, hoveredNodeId])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Re-sync when the graph prop changes
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes])
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges])

  useEffect(() => {
    const flowInstance = flowInstanceRef.current
    if (!flowInstance || graph.nodes.length === 0) return

    const fitOptions = layout === 'primary' ? PRIMARY_FIT_VIEW_OPTIONS : SIDE_FIT_VIEW_OPTIONS
    const animationFrames = [requestAnimationFrame(() => flowInstance.fitView(fitOptions))]
    const timers = [
      window.setTimeout(() => flowInstance.fitView(fitOptions), 120),
      window.setTimeout(() => flowInstance.fitView(fitOptions), 260),
    ]

    return () => {
      animationFrames.forEach((frame) => cancelAnimationFrame(frame))
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [graph.nodes.length, layout, leftCollapsed, rightCollapsed])

  return (
    <section
      className="flex h-screen overflow-hidden"
      style={{
        width: layout === 'primary' ? 'auto' : '420px',
        flex: layout === 'primary' ? '1 1 auto' : '0 0 auto',
        minWidth: 0,
        background: 'var(--mirror-pane)',
        borderLeft: layout === 'side' ? '1px solid var(--mirror-border)' : 'none',
        borderRight: layout === 'primary' ? '1px solid var(--mirror-border)' : 'none',
      }}
    >
      <div className="flex h-full w-full flex-col">
        {layout === 'primary' && (
          <div className="px-4 pb-0 pt-3">
            <div
              className="rounded-[30px] border px-6 py-5"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--mirror-accent) 12%, var(--mirror-pane)) 0%, color-mix(in srgb, var(--node-person-border) 10%, var(--mirror-pane)) 38%, color-mix(in srgb, var(--node-role-border) 10%, var(--mirror-pane)) 100%)',
                borderColor: 'var(--mirror-border)',
                boxShadow: '0 16px 40px rgba(53, 42, 27, 0.06)',
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full"
                      style={{
                        background:
                          'linear-gradient(135deg, var(--mirror-accent-subtle), color-mix(in srgb, var(--mirror-accent) 24%, transparent))',
                        boxShadow:
                          '0 8px 18px color-mix(in srgb, var(--mirror-accent) 15%, transparent)',
                      }}
                    >
                      <Activity size={13} style={{ color: 'var(--mirror-accent)' }} />
                    </div>
                    <div
                      className="text-[11px] font-semibold uppercase tracking-[0.24em]"
                      style={{ color: 'var(--mirror-secondary)' }}
                    >
                      Mirror map
                    </div>
                  </div>
                  <h1 className="text-xl font-semibold" style={{ color: 'var(--mirror-text)' }}>
                    A living map of your inner world
                  </h1>
                  <p
                    className="mt-1 max-w-2xl text-sm leading-relaxed"
                    style={{ color: 'var(--mirror-secondary)' }}
                  >
                    People, themes, and patterns take shape as you reflect.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--mirror-accent) 14%, transparent)',
                        color: 'var(--mirror-accent)',
                        border: '1px solid color-mix(in srgb, var(--mirror-accent) 18%, var(--mirror-border))',
                      }}
                    >
                      Patterns
                    </span>
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--node-person-border) 12%, transparent)',
                        color: 'var(--node-person-border)',
                        border: '1px solid color-mix(in srgb, var(--node-person-border) 18%, var(--mirror-border))',
                      }}
                    >
                      People
                    </span>
                    <span
                      className="rounded-full px-3 py-1 text-[11px] font-medium"
                      style={{
                        background: 'color-mix(in srgb, var(--node-role-border) 12%, transparent)',
                        color: 'var(--node-role-border)',
                        border: '1px solid color-mix(in srgb, var(--node-role-border) 18%, var(--mirror-border))',
                      }}
                    >
                      Themes
                    </span>
                  </div>
                </div>
                <div className="hidden flex-wrap justify-end gap-2 md:flex">
                  <span
                    className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                    style={{
                      background: 'var(--mirror-surface)',
                      color: 'var(--mirror-secondary)',
                      border: '1px solid var(--mirror-border)',
                    }}
                  >
                    {graph.nodes.length} nodes
                  </span>
                  <span
                    className="rounded-full px-3 py-1.5 text-[11px] font-medium"
                    style={{
                      background: 'var(--mirror-surface)',
                      color: 'var(--mirror-secondary)',
                      border: '1px solid var(--mirror-border)',
                    }}
                  >
                    {graph.edges.length} links
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div
          className={`relative flex-1 overflow-hidden ${layout === 'primary' ? 'm-3 rounded-[40px]' : 'm-3 rounded-[28px]'}`}
          style={{
            background:
              'radial-gradient(circle at top, var(--mirror-surface), transparent 58%), var(--mirror-pane)',
            border: '1px solid var(--mirror-border)',
          }}
        >
          {graph.nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: 'var(--mirror-elevated)' }}
              >
                <Brain size={20} style={{ color: 'var(--mirror-muted)' }} />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
                Your psyche graph will build itself here
                <br />
                as you share what&apos;s on your mind.
              </p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(event, node) => {
                event.preventDefault()
                event.stopPropagation()

                onSelectNode?.(node.id, {
                  additive: event.shiftKey || event.getModifierState('Shift'),
                })
              }}
              onNodeMouseEnter={(_, node) => setHoveredNodeId(node.id)}
              onNodeMouseLeave={() => setHoveredNodeId(null)}
              onPaneClick={() => onSelectNode?.(null)}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                flowInstanceRef.current = instance
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              fitView
              fitViewOptions={layout === 'primary' ? PRIMARY_FIT_VIEW_OPTIONS : SIDE_FIT_VIEW_OPTIONS}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={2}
              defaultEdgeOptions={{ type: 'default' }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={26}
                size={1.2}
                color="var(--graph-dot-color)"
              />
              <Controls
                style={{
                  background: 'var(--mirror-elevated)',
                  border: '1px solid var(--mirror-border)',
                  borderRadius: '999px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                }}
                showInteractive={false}
              />
            </ReactFlow>
          )}
          {selectedNodeIds.length > 0 && (
            <div
              className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border px-3 py-1.5 text-[10px] font-medium"
              style={{
                background: 'color-mix(in srgb, var(--mirror-surface) 74%, transparent)',
                borderColor: 'color-mix(in srgb, var(--mirror-border) 70%, transparent)',
                color: 'var(--mirror-muted)',
                boxShadow: '0 8px 20px rgba(53, 42, 27, 0.04)',
                backdropFilter: 'blur(14px)',
                opacity: 0.82,
              }}
            >
              Shift + click to select multiple nodes
            </div>
          )}
        </div>

        <div
          className={`flex flex-shrink-0 items-center justify-around ${layout === 'primary' ? 'px-5 pb-4 pt-0' : 'px-4 pb-4 pt-1'}`}
        >
          <LegendItem type="user" label="You" />
          <LegendItem type="domain" label="Theme" />
          <LegendItem type="person" label="Person" />
          <LegendItem type="role" label="Group" />
        </div>
      </div>
    </section>
  )
}

function LegendItem({ type, label }: { type: NodeType; label: string }) {
  const config = NODE_STYLES[type]
  const Icon = config.icon
  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2 py-1"
      style={{
        background: 'var(--mirror-surface)',
        border: '1px solid var(--mirror-border)',
      }}
    >
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 16,
          height: 16,
          background: config.bg,
          border: `1px solid ${config.border}`,
          color: config.fg,
        }}
      >
        <Icon size={8} strokeWidth={2} />
      </div>
      <span className="text-[10px]" style={{ color: 'var(--mirror-secondary)' }}>
        {label}
      </span>
    </div>
  )
}
