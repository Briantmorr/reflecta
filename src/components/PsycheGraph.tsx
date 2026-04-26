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
  EdgeProps,
  BackgroundVariant,
  useInternalNode,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  Brain,
  Users,
  User as UserIcon,
  Briefcase,
  Heart,
  Activity,
  Palette,
  Home,
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
  inFocus: boolean
  driftDelay: number
  question?: string
}

function hashIdToDriftDelay(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return -(Math.abs(h) % 9000) / 1000
}

function PsycheNode({ data }: NodeProps) {
  const nodeData = data as PsycheNodeData
  const config = NODE_STYLES[nodeData.type]
  const Icon = getNodeIcon(nodeData.type, nodeData.label)
  const scale = 1 + Math.min(nodeData.mentionCount * 0.04, 0.24)
  const isDormant = nodeData.dormant
  const isSelected = nodeData.selected
  const isUser = nodeData.type === 'user'
  const isDim = !nodeData.inFocus
  const shellClassName =
    `psyche-node-shell${isDormant ? ' is-dormant' : ''}${isSelected ? ' is-selected' : ''}` +
    `${isUser ? ' is-user' : ''}${isDim ? ' is-dim' : ''}`

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className={`group flex flex-col items-center gap-1.5 ${shellClassName}`}
        style={{
          transform: `scale(${scale})`,
          opacity: isDim ? undefined : isDormant ? 0.72 : 1,
          filter: isSelected
            ? 'drop-shadow(0 22px 36px color-mix(in srgb, var(--mirror-accent) 34%, transparent))'
            : nodeData.highlighted
              ? 'drop-shadow(0 12px 24px var(--mirror-accent-subtle))'
            : 'none',
          // @ts-expect-error CSS custom property
          '--drift-delay': `${nodeData.driftDelay}s`,
        }}
      >
        <div
          className="psyche-node-icon flex items-center justify-center rounded-full transition-all duration-200 group-hover:-translate-y-0.5"
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
          className="psyche-node-label whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em] transition-all duration-200 group-hover:-translate-y-0.5"
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

// ─── Custom edge: straight line trimmed to circle rims ────
interface PsycheEdgeData extends Record<string, unknown> {
  fromColor: string
  toColor: string
  fromRadius: number
  toRadius: number
  strokeWidth: number
  opacity: number
  pulsing: boolean
  isDim: boolean
}

function PsycheEdge({ id, source, target, data }: EdgeProps) {
  const edgeData = (data ?? {}) as PsycheEdgeData
  const sourceNode = useInternalNode(source)
  const targetNode = useInternalNode(target)

  if (!sourceNode || !targetNode) return null

  // Node position is top-left of the shell; the circle sits at the top,
  // centered horizontally. Shell width tracks the widest child (usually
  // the label chip), so horizontal center = position + measuredWidth / 2.
  const sourceWidth = sourceNode.measured?.width ?? edgeData.fromRadius * 2
  const targetWidth = targetNode.measured?.width ?? edgeData.toRadius * 2
  const sx = sourceNode.internals.positionAbsolute.x + sourceWidth / 2
  const sy = sourceNode.internals.positionAbsolute.y + edgeData.fromRadius
  const tx = targetNode.internals.positionAbsolute.x + targetWidth / 2
  const ty = targetNode.internals.positionAbsolute.y + edgeData.toRadius

  const dx = tx - sx
  const dy = ty - sy
  const dist = Math.hypot(dx, dy) || 1

  // If nodes overlap, bail on drawing.
  if (dist <= edgeData.fromRadius + edgeData.toRadius) return null

  const ux = dx / dist
  const uy = dy / dist
  // Small gap so the line doesn't touch the border stroke.
  const gap = 2
  const x1 = sx + ux * (edgeData.fromRadius + gap)
  const y1 = sy + uy * (edgeData.fromRadius + gap)
  const x2 = tx - ux * (edgeData.toRadius + gap)
  const y2 = ty - uy * (edgeData.toRadius + gap)

  const path = `M ${x1} ${y1} L ${x2} ${y2}`
  const gradId = `psyche-edge-grad-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  const isDim = edgeData.isDim
  const stroke = isDim ? 'var(--node-edge-stroke)' : `url(#${gradId})`

  return (
    <>
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
        >
          <stop offset="0%" stopColor={edgeData.fromColor} stopOpacity={0.9} />
          <stop offset="100%" stopColor={edgeData.toColor} stopOpacity={0.9} />
        </linearGradient>
      </defs>
      <path
        id={id}
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={edgeData.strokeWidth}
        strokeOpacity={isDim ? 0.18 : edgeData.opacity}
        strokeLinecap="round"
        style={{
          transition:
            'stroke-width 220ms ease, stroke-opacity 220ms ease',
        }}
      />
      {edgeData.pulsing && !isDim && (
        <circle
          r={1.35}
          className="psyche-edge-pulse"
          fill={edgeData.toColor}
          opacity={0.34}
        >
          <animateMotion dur="4.8s" repeatCount="indefinite" path={path} />
        </circle>
      )}
    </>
  )
}

const nodeTypes = { psyche: PsycheNode }
const edgeTypes = { psyche: PsycheEdge }
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

// Solid accent colors used for edge gradient stops (gradients won't paint SVG stroke).
const NODE_ACCENT: Record<NodeType, string> = {
  user: '#b8934b',
  domain: '#64748b',
  person: '#5e7a99',
  role: '#836aa3',
  emotion: '#a06b6b',
}

const DOMAIN_ICONS: Record<string, LucideIcon> = {
  Self: UserIcon,
  Health: Activity,
  Work: Briefcase,
  Relationships: Heart,
  Hobbies: Palette,
  Lifestyle: Home,
}

function getNodeIcon(type: NodeType, label?: string) {
  if (type === 'domain' && label) {
    return DOMAIN_ICONS[label] ?? NODE_STYLES.domain.icon
  }

  return NODE_STYLES[type].icon
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

  // Build full adjacency (including user edges) for focus-mode traversal.
  const fullAdjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!fullAdjacency.has(edge.fromId)) fullAdjacency.set(edge.fromId, new Set())
    if (!fullAdjacency.has(edge.toId)) fullAdjacency.set(edge.toId, new Set())
    fullAdjacency.get(edge.fromId)?.add(edge.toId)
    fullAdjacency.get(edge.toId)?.add(edge.fromId)
  }

  return { positions, parentByNode, childrenByParent, userNodeId, adjacency: fullAdjacency }
}

// Walk ancestry back to user + include selected + direct children.
function computeFocusSet(
  selectedIds: string[],
  parentByNode: Map<string, string>,
  childrenByParent: Map<string, string[]>,
  adjacency: Map<string, Set<string>>,
  userNodeId: string
): Set<string> | null {
  if (selectedIds.length === 0) return null
  const focus = new Set<string>([userNodeId])
  for (const id of selectedIds) {
    focus.add(id)
    // ancestry
    let cursor: string | undefined = id
    while (cursor && parentByNode.has(cursor)) {
      cursor = parentByNode.get(cursor)
      if (cursor) focus.add(cursor)
    }
    // direct children (via layout hierarchy)
    for (const childId of childrenByParent.get(id) ?? []) focus.add(childId)
    // direct neighbors (catches user↔node edges + horizontal links)
    for (const neighbor of adjacency.get(id) ?? []) focus.add(neighbor)
  }
  return focus
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
  const graphLayout = useMemo(() => computeLayout(graph), [graph])

  const focusSet = useMemo(
    () =>
      computeFocusSet(
        selectedNodeIds,
        graphLayout.parentByNode,
        graphLayout.childrenByParent,
        graphLayout.adjacency,
        graphLayout.userNodeId
      ),
    [selectedNodeIds, graphLayout]
  )

  const initialNodes = useMemo<FlowNode[]>(() => {
    const selected = new Set(selectedNodeIds)
    const highlighted = new Set([...highlightedNodeIds, ...selectedNodeIds])

    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'psyche',
      position: graphLayout.positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        mentionCount: n.mentionCount,
        highlighted: highlighted.has(n.id),
        selected: selected.has(n.id),
        dormant: Boolean(n.dormant),
        inFocus: focusSet ? focusSet.has(n.id) : true,
        driftDelay: hashIdToDriftDelay(n.id),
        question: n.question,
      } satisfies PsycheNodeData,
    }))
  }, [graph, highlightedNodeIds, selectedNodeIds, graphLayout, focusSet])

  const initialEdges = useMemo<FlowEdge[]>(() => {
    const highlighted = new Set(highlightedNodeIds)
    return graph.edges.map((e) => {
      const isHot = highlighted.has(e.fromId) && highlighted.has(e.toId)
      const isHovered = hoveredNodeId !== null && (e.fromId === hoveredNodeId || e.toId === hoveredNodeId)
      const fromNode = graph.nodes.find((node) => node.id === e.fromId)
      const toNode = graph.nodes.find((node) => node.id === e.toId)
      const isDormantEdge = Boolean(fromNode?.dormant || toNode?.dormant)
      const edgeInFocus = focusSet
        ? focusSet.has(e.fromId) && focusSet.has(e.toId)
        : true

      const fromColor = isHot
        ? 'var(--mirror-accent)'
        : NODE_ACCENT[fromNode?.type ?? 'person']
      const toColor = isHot
        ? 'var(--mirror-accent)'
        : NODE_ACCENT[toNode?.type ?? 'person']

      const fromScale = 1 + Math.min((fromNode?.mentionCount ?? 0) * 0.04, 0.24)
      const toScale = 1 + Math.min((toNode?.mentionCount ?? 0) * 0.04, 0.24)
      const fromRadius =
        ((fromNode ? NODE_STYLES[fromNode.type].size : 30) * fromScale) / 2
      const toRadius =
        ((toNode ? NODE_STYLES[toNode.type].size : 30) * toScale) / 2

      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        type: 'psyche',
        data: {
          fromColor,
          toColor,
          fromRadius,
          toRadius,
          strokeWidth: isHot ? 2.4 : isHovered ? 2.0 : isDormantEdge ? 1.1 : 1.4,
          opacity: isHot ? 0.96 : isHovered ? 0.82 : isDormantEdge ? 0.32 : 0.62,
          pulsing: isHot,
          isDim: !edgeInFocus,
        } satisfies PsycheEdgeData,
        animated: false,
      }
    })
  }, [graph, highlightedNodeIds, hoveredNodeId, focusSet])

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
      className="relative flex h-full overflow-hidden"
      style={{
        width: layout === 'primary' ? '100%' : '420px',
        flex: layout === 'primary' ? '1 1 auto' : '0 0 auto',
        minWidth: 0,
        background: 'var(--mirror-pane)',
        boxShadow:
          layout === 'primary'
            ? '0 0 0 1px rgba(53, 42, 27, 0.02)'
            : '-12px 0 28px rgba(53, 42, 27, 0.035)',
      }}
    >
      <div className="flex h-full w-full flex-col">
        <div
          className={`psyche-glass-frame relative flex-1 overflow-hidden ${layout === 'primary' ? 'm-0 rounded-none' : 'm-3 rounded-[28px]'}`}
        >
          <div className="psyche-glass-aurora" aria-hidden="true" />
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
            <>
              <div className="psyche-graph-glow" aria-hidden="true" />
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
              edgeTypes={edgeTypes}
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
                  borderRadius: '999px',
                  overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08), inset 0 0 0 1px rgba(53, 42, 27, 0.05)',
                }}
                showInteractive={false}
              />
              </ReactFlow>
            </>
          )}
          {selectedNodeIds.length > 0 && (
            <div
              className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border px-3 py-1.5 text-[10px] font-medium"
              style={{
                background: 'color-mix(in srgb, var(--mirror-surface) 74%, transparent)',
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
          className={`${layout === 'primary' ? 'pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2' : 'flex flex-shrink-0 justify-center px-4 pb-4 pt-1'}`}
        >
          <div
            className="flex items-center gap-3 rounded-full px-3 py-2"
            style={{
              background: 'color-mix(in srgb, var(--mirror-surface) 84%, transparent)',
              boxShadow: '0 8px 22px rgba(0, 0, 0, 0.05)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: 'var(--mirror-muted)' }}
            >
              Legend
            </span>
            <div className="flex items-center gap-2.5">
              <LegendItem type="user" label="You" />
              <LegendItem type="domain" label="Theme" />
              <LegendItem type="person" label="Person" />
              <LegendItem type="role" label="Group" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function LegendItem({ type, label }: { type: NodeType; label: string }) {
  const config = NODE_STYLES[type]
  const Icon = getNodeIcon(type, label)
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 18,
          height: 18,
          background: config.bg,
          boxShadow: `inset 0 0 0 1px ${config.border}`,
          color: config.fg,
        }}
      >
        <Icon size={10} strokeWidth={2} />
      </div>
      <span className="text-[11px] font-medium" style={{ color: 'var(--mirror-secondary)' }}>
        {label}
      </span>
    </div>
  )
}
