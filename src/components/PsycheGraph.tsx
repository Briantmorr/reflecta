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
import {
  Brain,
  Users,
  User as UserIcon,
  Briefcase,
  Heart,
  Activity,
  PanelRightClose,
  PanelRightOpen,
  type LucideIcon,
} from 'lucide-react'
import { Graph, NodeType } from '@/types'
import { useSettings } from '@/lib/settings'

interface PsycheGraphProps {
  graph: Graph
  highlightedNodeIds?: string[]
  selectedNodeId?: string | null
  onSelectNode?: (nodeId: string | null) => void
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
  const scale = 1 + Math.min(nodeData.mentionCount * 0.04, 0.24)

  return (
    <>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div
        className="flex flex-col items-center gap-1.5 transition-all"
        style={{
          transform: `scale(${scale})`,
          filter: nodeData.highlighted
            ? 'drop-shadow(0 12px 24px var(--mirror-accent-subtle))'
            : 'none',
        }}
      >
        <div
          className="flex items-center justify-center rounded-full transition-all"
          style={{
            width: config.size,
            height: config.size,
            background: config.bg,
            border: `1.5px solid ${nodeData.highlighted ? 'var(--mirror-accent)' : config.border}`,
            color: config.fg,
            boxShadow: nodeData.highlighted
              ? '0 0 0 6px var(--mirror-accent-subtle)'
              : 'var(--node-shadow)',
          }}
        >
          <Icon size={config.iconSize} strokeWidth={1.9} />
        </div>
        <div
          className="whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium tracking-[0.08em]"
          style={{
            color: nodeData.highlighted ? 'var(--mirror-accent)' : 'var(--mirror-secondary)',
            background: 'var(--node-label-bg)',
            border: '1px solid var(--mirror-border)',
            backdropFilter: 'blur(10px)',
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
    bg: 'var(--node-user-bg)',
    fg: 'var(--node-user-fg)',
    border: 'var(--node-user-border)',
    icon: UserIcon,
    size: 44,
    iconSize: 18,
  },
  domain: {
    bg: 'var(--node-domain-bg)',
    fg: 'var(--node-domain-fg)',
    border: 'var(--node-domain-border)',
    icon: Brain,
    size: 34,
    iconSize: 15,
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

  // Group other nodes by their "parent domain" (based on edges to domain nodes)
  const domainNodes = graph.nodes.filter((n) => n.type === 'domain')
  const nonDomainNonUser = graph.nodes.filter((n) => n.type !== 'domain' && n.type !== 'user')

  const positions = new Map<string, { x: number; y: number }>()

  // User at origin
  positions.set(userNodeId, { x: 0, y: 0 })

  // Place domains in an inner ring
  const domainRadius = 150
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
  const childRadius = 96
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
  const orphanRadius = 250
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
export default function PsycheGraph({
  graph,
  highlightedNodeIds = [],
  selectedNodeId = null,
  onSelectNode,
}: PsycheGraphProps) {
  const { rightCollapsed, toggleRight } = useSettings()
  const initialNodes = useMemo<FlowNode[]>(() => {
    const positions = computeLayout(graph)
    const highlighted = new Set(
      selectedNodeId ? [...highlightedNodeIds, selectedNodeId] : highlightedNodeIds
    )

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
        style: {
          stroke: isHot ? 'var(--mirror-accent)' : 'var(--node-edge-stroke)',
          strokeWidth: isHot ? 1.5 : 0.85,
          opacity: isHot ? 0.9 : 0.42,
        },
        animated: false,
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
      className="flex h-screen overflow-hidden transition-[width] duration-200"
      style={{
        width: rightCollapsed ? '72px' : '420px',
        flexShrink: 0,
        background: 'var(--mirror-pane)',
        borderLeft: '1px solid var(--mirror-border)',
      }}
    >
      <div className="flex h-full w-full flex-col">
        <div
          className={`flex flex-shrink-0 px-4 py-4 ${rightCollapsed ? 'flex-col items-center gap-2' : 'items-center justify-between'}`}
          style={{
            borderBottom: '1px solid var(--mirror-border)',
            background: 'var(--mirror-nav)',
          }}
        >
          <div className={`flex items-center gap-2 ${rightCollapsed ? 'flex-col' : ''}`}>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: 'var(--mirror-accent-subtle)' }}
            >
              <Activity size={13} style={{ color: 'var(--mirror-accent)' }} />
            </div>
            {!rightCollapsed && (
              <div>
                <div
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: 'var(--mirror-secondary)' }}
                >
                  Map
                </div>
                <span className="text-sm font-semibold" style={{ color: 'var(--mirror-text)' }}>
                  Psyche graph
                </span>
              </div>
            )}
          </div>
          <div className={`flex items-center ${rightCollapsed ? 'flex-col gap-2' : 'gap-3'}`}>
            {!rightCollapsed && (
              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-medium"
                  style={{
                    background: 'var(--mirror-surface)',
                    color: 'var(--mirror-secondary)',
                    border: '1px solid var(--mirror-border)',
                  }}
                >
                  {graph.nodes.length} nodes
                </span>
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-medium"
                  style={{
                    background: 'var(--mirror-surface)',
                    color: 'var(--mirror-secondary)',
                    border: '1px solid var(--mirror-border)',
                  }}
                >
                  {graph.edges.length} links
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={toggleRight}
              title={rightCollapsed ? 'Expand graph' : 'Collapse graph'}
              aria-label={rightCollapsed ? 'Expand graph' : 'Collapse graph'}
              className="mirror-focus-ring flex h-8 w-8 items-center justify-center rounded-full transition-colors"
              style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
            >
              {rightCollapsed ? <PanelRightOpen size={14} /> : <PanelRightClose size={14} />}
            </button>
          </div>
        </div>

        {rightCollapsed ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-2">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl"
              style={{ background: 'var(--mirror-elevated)', color: 'var(--mirror-secondary)' }}
            >
              <Brain size={18} />
            </div>
            <button
              type="button"
              onClick={toggleRight}
              className="mirror-focus-ring rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors"
              style={{
                background: 'var(--mirror-accent-subtle)',
                color: 'var(--mirror-accent)',
              }}
            >
              Open
            </button>
          </div>
        ) : (
          <>
            <div
              className="relative m-3 flex-1 overflow-hidden rounded-[28px]"
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
                  onNodeClick={(_, node) => onSelectNode?.(node.id)}
                  onPaneClick={() => onSelectNode?.(null)}
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
            </div>

            <div
              className="flex flex-shrink-0 items-center justify-around px-4 pb-4 pt-1"
            >
              <LegendItem type="user" label="You" />
              <LegendItem type="domain" label="Theme" />
              <LegendItem type="person" label="Person" />
              <LegendItem type="role" label="Group" />
            </div>
          </>
        )}
      </div>
    </aside>
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
