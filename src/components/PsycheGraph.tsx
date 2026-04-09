'use client'

import { useMemo, useEffect } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Node as FlowNode,
  Edge as FlowEdge,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  NodeProps,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Brain, Users, User as UserIcon, Briefcase, Heart, Activity, type LucideIcon } from 'lucide-react'
import { Graph, NodeType } from '@/types'

interface PsycheGraphProps {
  graph: Graph
  highlightedNodeIds?: string[]
}

// ─── Custom node rendering ─────────────────────────────────
interface PsycheNodeData extends Record<string, unknown> {
  label: string
  type: NodeType
  mentionCount: number
  highlighted: boolean
}

function PsycheNode({ data }: NodeProps) {
  const nodeData = data as PsycheNodeData
  const config = NODE_STYLES[nodeData.type]
  const Icon = config.icon
  const scale = 1 + Math.min(nodeData.mentionCount * 0.08, 0.6)

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex flex-col items-center gap-1 transition-all"
        style={{
          transform: `scale(${scale})`,
          filter: nodeData.highlighted
            ? 'drop-shadow(0 0 12px var(--mirror-accent))'
            : 'none',
        }}
      >
        <div
          className="flex items-center justify-center rounded-full transition-all"
          style={{
            width: config.size,
            height: config.size,
            background: config.bg,
            border: `2px solid ${nodeData.highlighted ? 'var(--mirror-accent)' : config.border}`,
            color: config.fg,
            boxShadow: nodeData.highlighted
              ? '0 0 0 4px var(--mirror-accent-dim)'
              : '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Icon size={config.iconSize} strokeWidth={2.2} />
        </div>
        <div
          className="text-xs font-medium px-2 py-0.5 rounded whitespace-nowrap"
          style={{
            color: 'var(--mirror-text)',
            background: 'rgba(15, 13, 11, 0.85)',
            fontSize: '11px',
            backdropFilter: 'blur(4px)',
          }}
        >
          {nodeData.label}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </>
  )
}

const nodeTypes = { psyche: PsycheNode }

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
    bg: 'linear-gradient(135deg, #c9a96e 0%, #a8864f 100%)',
    fg: '#0f0d0b',
    border: '#d4b87a',
    icon: UserIcon,
    size: 56,
    iconSize: 24,
  },
  domain: {
    bg: 'linear-gradient(135deg, #2d3748 0%, #1a202c 100%)',
    fg: '#e8e3da',
    border: '#4a5568',
    icon: Brain,
    size: 44,
    iconSize: 20,
  },
  person: {
    bg: 'linear-gradient(135deg, #2b4060 0%, #1a2838 100%)',
    fg: '#cbd5e0',
    border: '#3e5473',
    icon: Users,
    size: 40,
    iconSize: 18,
  },
  role: {
    bg: 'linear-gradient(135deg, #4a3b5f 0%, #2d2438 100%)',
    fg: '#e9d5ff',
    border: '#6b4d85',
    icon: Briefcase,
    size: 40,
    iconSize: 18,
  },
  emotion: {
    bg: 'linear-gradient(135deg, #5a3b3b 0%, #3a2424 100%)',
    fg: '#fecaca',
    border: '#7f4f4f',
    icon: Heart,
    size: 38,
    iconSize: 17,
  },
}

// ─── Layout algorithm: radial, user at center ─────────────
function computeLayout(graph: Graph) {
  const userNode = graph.nodes.find((n) => n.type === 'user')
  const userNodeId = userNode?.id ?? ''

  // Group other nodes by their "parent domain" (based on edges to domain nodes)
  const domainNodes = graph.nodes.filter((n) => n.type === 'domain')
  const nonDomainNonUser = graph.nodes.filter((n) => n.type !== 'domain' && n.type !== 'user')

  const positions = new Map<string, { x: number; y: number }>()

  // User at origin
  positions.set(userNodeId, { x: 0, y: 0 })

  // Place domains in an inner ring
  const domainRadius = 180
  domainNodes.forEach((d, i) => {
    const angle = (i / Math.max(domainNodes.length, 1)) * Math.PI * 2 - Math.PI / 2
    positions.set(d.id, {
      x: Math.cos(angle) * domainRadius,
      y: Math.sin(angle) * domainRadius,
    })
  })

  // For each non-domain node, find which domain it connects to and cluster around it
  const domainChildren = new Map<string, string[]>() // domainId → [childNodeId]
  domainNodes.forEach((d) => domainChildren.set(d.id, []))
  const orphans: string[] = []

  for (const node of nonDomainNonUser) {
    const edge = graph.edges.find(
      (e) =>
        (e.fromId === node.id && domainNodes.some((d) => d.id === e.toId)) ||
        (e.toId === node.id && domainNodes.some((d) => d.id === e.fromId))
    )
    if (edge) {
      const domainId = domainNodes.some((d) => d.id === edge.toId) ? edge.toId : edge.fromId
      domainChildren.get(domainId)?.push(node.id)
    } else {
      orphans.push(node.id)
    }
  }

  // Place children around their domain
  const childRadius = 110
  domainChildren.forEach((childIds, domainId) => {
    const parentPos = positions.get(domainId)
    if (!parentPos || childIds.length === 0) return
    const parentAngle = Math.atan2(parentPos.y, parentPos.x)
    const spread = Math.PI / 2.5
    childIds.forEach((childId, i) => {
      const localAngle =
        childIds.length === 1
          ? parentAngle
          : parentAngle - spread / 2 + (spread * i) / (childIds.length - 1)
      positions.set(childId, {
        x: parentPos.x + Math.cos(localAngle) * childRadius,
        y: parentPos.y + Math.sin(localAngle) * childRadius,
      })
    })
  })

  // Orphans: place in outer ring
  const orphanRadius = 320
  orphans.forEach((id, i) => {
    const angle = (i / Math.max(orphans.length, 1)) * Math.PI * 2
    positions.set(id, {
      x: Math.cos(angle) * orphanRadius,
      y: Math.sin(angle) * orphanRadius,
    })
  })

  return positions
}

// ─── Main component ───────────────────────────────────────
export default function PsycheGraph({ graph, highlightedNodeIds = [] }: PsycheGraphProps) {
  const initialNodes = useMemo<FlowNode[]>(() => {
    const positions = computeLayout(graph)
    const highlighted = new Set(highlightedNodeIds)

    return graph.nodes.map((n) => ({
      id: n.id,
      type: 'psyche',
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        mentionCount: n.mentionCount,
        highlighted: highlighted.has(n.id),
      } satisfies PsycheNodeData,
    }))
  }, [graph, highlightedNodeIds])

  const initialEdges = useMemo<FlowEdge[]>(() => {
    const highlighted = new Set(highlightedNodeIds)
    return graph.edges.map((e) => {
      const isHot = highlighted.has(e.fromId) && highlighted.has(e.toId)
      return {
        id: e.id,
        source: e.fromId,
        target: e.toId,
        label: e.relationship.replace(/_/g, ' '),
        labelStyle: {
          fill: 'var(--mirror-muted)',
          fontSize: 9,
          fontFamily: 'system-ui',
        },
        labelBgStyle: {
          fill: 'var(--mirror-bg)',
        },
        labelBgPadding: [4, 2] as [number, number],
        style: {
          stroke: isHot ? 'var(--mirror-accent)' : '#3d3632',
          strokeWidth: isHot ? 1.8 : 1,
          opacity: isHot ? 0.95 : 0.5,
        },
        animated: isHot,
      }
    })
  }, [graph, highlightedNodeIds])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Re-sync when the graph prop changes
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes])
  useEffect(() => setEdges(initialEdges), [initialEdges, setEdges])

  return (
    <aside
      className="flex flex-col h-screen overflow-hidden"
      style={{
        width: '420px',
        flexShrink: 0,
        background: 'var(--mirror-pane)',
        borderLeft: '1px solid var(--mirror-border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--mirror-border)',
          background: 'var(--mirror-nav)',
        }}
      >
        <div className="flex items-center gap-2">
          <Activity size={13} style={{ color: 'var(--mirror-accent)' }} />
          <span
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: 'var(--mirror-text)' }}
          >
            Psyche Graph
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--mirror-muted)' }}>
          {graph.nodes.length} nodes · {graph.edges.length} edges
        </span>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative">
        {graph.nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center"
              style={{ background: 'var(--mirror-elevated)' }}
            >
              <Brain size={20} style={{ color: 'var(--mirror-muted)' }} />
            </div>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--mirror-muted)' }}>
              Your psyche graph will build itself here
              <br />
              as you share what's on your mind.
            </p>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3, maxZoom: 1.2 }}
            proOptions={{ hideAttribution: true }}
            minZoom={0.3}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'default' }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color="#2a2520"
            />
            <Controls
              style={{
                background: 'var(--mirror-elevated)',
                border: '1px solid var(--mirror-border)',
                borderRadius: '6px',
              }}
              showInteractive={false}
            />
          </ReactFlow>
        )}
      </div>

      {/* Legend */}
      <div
        className="flex items-center justify-around px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--mirror-border)' }}
      >
        <LegendItem type="user" label="You" />
        <LegendItem type="domain" label="Domain" />
        <LegendItem type="person" label="Person" />
        <LegendItem type="emotion" label="Emotion" />
      </div>
    </aside>
  )
}

function LegendItem({ type, label }: { type: NodeType; label: string }) {
  const config = NODE_STYLES[type]
  const Icon = config.icon
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 18,
          height: 18,
          background: config.bg,
          border: `1.5px solid ${config.border}`,
          color: config.fg,
        }}
      >
        <Icon size={9} strokeWidth={2.5} />
      </div>
      <span className="text-xs" style={{ color: 'var(--mirror-secondary)', fontSize: '10px' }}>
        {label}
      </span>
    </div>
  )
}
