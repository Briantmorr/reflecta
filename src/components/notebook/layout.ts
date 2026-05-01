import { Graph, GraphNode } from '@/types'

export type NotebookPosition = { x: number; y: number; r: number }

const DOMAIN_ORDER = ['Lifestyle', 'Self', 'Health', 'Work', 'Relationships', 'Hobbies']

export function notebookLayout(
  graph: Graph,
  width: number,
  height: number,
  { cxFrac = 0.5, cyFrac = 0.54, scale = 1 } = {}
) {
  const cx = width * cxFrac
  const cy = height * cyFrac
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const userNode = graph.nodes.find((node) => node.type === 'user') ?? graph.nodes[0]
  const userId = userNode?.id ?? 'you'
  const positions = new Map<string, NotebookPosition>()

  if (userNode) positions.set(userNode.id, { x: cx, y: cy, r: 30 * scale })

  const domains = graph.nodes
    .filter((node) => node.type === 'domain')
    .sort((left, right) => DOMAIN_ORDER.indexOf(left.label) - DOMAIN_ORDER.indexOf(right.label))

  const radius = Math.min(width, height) * 0.23 * scale
  const fixedSlots: Record<string, { x: number; y: number; r: number }> = {
    Self: { x: cx, y: cy - radius, r: 21 * scale },
    Health: { x: cx + radius * 0.87, y: cy - radius * 0.5, r: 19 * scale },
    Lifestyle: { x: cx - radius * 0.87, y: cy - radius * 0.5, r: 19 * scale },
    Work: { x: cx + radius * 0.87, y: cy + radius * 0.5, r: 22 * scale },
    Hobbies: { x: cx - radius * 0.87, y: cy + radius * 0.5, r: 19 * scale },
    Relationships: { x: cx, y: cy + radius, r: 24 * scale },
  }

  domains.forEach((domain, index) => {
    const fixed = fixedSlots[domain.label]
    if (fixed) {
      positions.set(domain.id, fixed)
      return
    }
    const angle = (index / Math.max(domains.length, 1)) * Math.PI * 2 - Math.PI / 2
    positions.set(domain.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      r: 20 * scale,
    })
  })

  const childrenByParent = buildHierarchy(graph, userId)
  const placed = new Set<string>([userId, ...domains.map((node) => node.id)])

  const placeChildren = (parentId: string) => {
    const kids = (childrenByParent.get(parentId) ?? [])
      .filter((id) => !placed.has(id))
      .map((id) => nodeById.get(id))
      .filter(Boolean) as GraphNode[]
    if (kids.length === 0) return

    const parentPosition = positions.get(parentId)
    const parentNode = nodeById.get(parentId)
    if (!parentPosition || !parentNode) return

    const grandParentId = findParentId(graph, parentId)
    const grandPosition = grandParentId ? positions.get(grandParentId) : positions.get(userId)
    const vx = parentPosition.x - (grandPosition?.x ?? cx)
    const vy = parentPosition.y - (grandPosition?.y ?? cy)
    const magnitude = Math.hypot(vx, vy) || 1
    const ux = vx / magnitude
    const uy = vy / magnitude
    const tx = -uy
    const ty = ux
    const step = (parentNode.type === 'domain' ? 80 : 54) * scale
    const fan = Math.min(1.05, 0.5 + kids.length * 0.15)

    kids.forEach((kid, index) => {
      const t = kids.length === 1 ? 0 : (index / (kids.length - 1) - 0.5) * 2 * fan
      positions.set(kid.id, {
        x: parentPosition.x + ux * step + tx * step * 0.6 * t,
        y: parentPosition.y + uy * step + ty * step * 0.6 * t,
        r: (kid.type === 'role' ? 14 : 11) * scale,
      })
      placed.add(kid.id)
      placeChildren(kid.id)
    })
  }

  domains.forEach((domain) => placeChildren(domain.id))

  return { positions, userId, childrenByParent }
}

function buildHierarchy(graph: Graph, userId: string) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (edge.fromId === userId || edge.toId === userId) continue
    if (!adjacency.has(edge.fromId)) adjacency.set(edge.fromId, new Set())
    if (!adjacency.has(edge.toId)) adjacency.set(edge.toId, new Set())
    adjacency.get(edge.fromId)?.add(edge.toId)
    adjacency.get(edge.toId)?.add(edge.fromId)
  }

  const domains = graph.nodes.filter((node) => node.type === 'domain')
  const visited = new Set<string>([userId, ...domains.map((node) => node.id)])
  const queue = domains.map((node) => node.id)
  const childrenByParent = new Map<string, string[]>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) continue
    const neighbors = [...(adjacency.get(current) ?? [])].sort((leftId, rightId) => {
      const left = nodeById.get(leftId)
      const right = nodeById.get(rightId)
      const priority = { role: 0, person: 1, domain: 2, user: 3, emotion: 4 }
      return (priority[left?.type ?? 'person'] ?? 9) - (priority[right?.type ?? 'person'] ?? 9)
    })

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue
      visited.add(neighbor)
      const children = childrenByParent.get(current) ?? []
      children.push(neighbor)
      childrenByParent.set(current, children)
      queue.push(neighbor)
    }
  }

  return childrenByParent
}

function findParentId(graph: Graph, nodeId: string) {
  const edge = graph.edges.find((candidate) => candidate.fromId === nodeId)
  return edge?.toId
}
