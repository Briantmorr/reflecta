import { GraphNode } from '@/types'
import { iconForNode, MIcon } from './icons'
import { NotebookPosition } from './layout'

interface InkNodeProps {
  node: GraphNode
  pos: NotebookPosition
  selected: boolean
  onClick: () => void
}

export function InkNode({ node, pos, selected, onClick }: InkNodeProps) {
  const isYou = node.type === 'user'
  const isDomain = node.type === 'domain'
  const radius = pos.r
  const stroke = selected ? '#7a4a1e' : '#201912'
  const fill = isYou ? '#2a2318' : node.dormant ? '#ece3c8' : '#fdf8eb'
  const iconColor = isYou ? '#fbf5e4' : '#201912'

  return (
    <g
      transform={`translate(${pos.x},${pos.y})`}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      style={{ cursor: 'pointer' }}
      opacity={node.dormant ? 0.7 : 1}
    >
      {selected && <circle r={radius + 8} fill="none" stroke="#7a4a1e" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.8" />}
      {selected && <circle r={radius + 2} fill="#b07a3c" opacity="0.1" />}
      <circle
        r={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={isYou ? 1.6 : isDomain ? 1.1 : 0.9}
        strokeDasharray={node.dormant ? '4 3' : undefined}
        filter="url(#pg-wobble)"
      />
      <g transform={`translate(${-radius * 0.55},${-radius * 0.55})`} color={iconColor}>
        <MIcon name={isYou ? 'self' : iconForNode(node)} size={radius * 1.1} strokeWidth={1.4} />
      </g>
      <text
        y={radius + 13}
        textAnchor="middle"
        style={{
          fontFamily: 'var(--serif)',
          fontSize: isYou ? 12 : isDomain ? 11 : 10,
          fontStyle: isDomain || isYou ? 'normal' : 'italic',
          fontWeight: isYou ? 500 : 400,
          letterSpacing: isDomain ? '0.06em' : 0,
          fill: selected ? '#7a4a1e' : '#201912',
          userSelect: 'none',
        }}
      >
        {node.label}
      </text>
    </g>
  )
}
