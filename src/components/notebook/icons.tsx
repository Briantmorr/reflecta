import { SVGProps } from 'react'
import { GraphNode } from '@/types'

type IconName =
  | 'self'
  | 'health'
  | 'work'
  | 'relationships'
  | 'hobbies'
  | 'lifestyle'
  | 'person'
  | 'group'
  | 'send'
  | 'x'

interface MIconProps extends SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
  strokeWidth?: number
}

export function MIcon({ name, size = 14, strokeWidth = 1.4, ...props }: MIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  }

  switch (name) {
    case 'self':
      return <svg {...common}><circle cx="12" cy="9" r="3.2" /><path d="M5 20c1.4-3.4 4-5 7-5s5.6 1.6 7 5" /></svg>
    case 'health':
      return <svg {...common}><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
    case 'work':
      return <svg {...common}><rect x="3" y="7" width="18" height="12" rx="1.5" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 13h18" /></svg>
    case 'relationships':
      return <svg {...common}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
    case 'hobbies':
      return <svg {...common}><circle cx="12" cy="12" r="8" /><circle cx="8.5" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15.5" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="10" cy="15" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="0.8" fill="currentColor" stroke="none" /></svg>
    case 'lifestyle':
      return <svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10.5V20h14V10.5" /></svg>
    case 'person':
      return <svg {...common}><circle cx="12" cy="9" r="2.8" /><path d="M6 19c1.1-2.7 3.4-4 6-4s4.9 1.3 6 4" /></svg>
    case 'group':
      return <svg {...common}><circle cx="9" cy="10" r="2.4" /><circle cx="16" cy="10" r="2.1" /><path d="M4 19c.8-2.5 2.7-3.7 5-3.7s4.2 1.2 5 3.7" /><path d="M14 17c.7-1.5 2-2.2 3.5-2.2 1.2 0 2.2.4 2.9 1.2" /></svg>
    case 'send':
      return <svg {...common}><path d="M4 12 20 4l-5 16-3-7-8-1z" /></svg>
    case 'x':
      return <svg {...common}><path d="M6 6l12 12M18 6 6 18" /></svg>
    default:
      return null
  }
}

const ICON_FOR_LABEL: Record<string, IconName> = {
  Self: 'self',
  Health: 'health',
  Work: 'work',
  Relationships: 'relationships',
  Hobbies: 'hobbies',
  Lifestyle: 'lifestyle',
}

export function iconForNode(node: Pick<GraphNode, 'label' | 'type'>): IconName {
  if (node.type === 'domain') return ICON_FOR_LABEL[node.label] ?? 'self'
  if (node.type === 'role') return 'group'
  return 'person'
}
