interface InkLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  stroke?: string
  strokeWidth?: number
  opacity?: number
}

export function InkLine({
  x1,
  y1,
  x2,
  y2,
  stroke = '#2a2318',
  strokeWidth = 1,
  opacity = 0.7,
}: InkLineProps) {
  const mx = (x1 + x2) / 2 + (x2 - x1) * 0.02
  const my = (y1 + y2) / 2 + (y2 - y1) * 0.02 + 1.2

  return (
    <path
      d={`M${x1},${y1} Q${mx},${my} ${x2},${y2}`}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      fill="none"
      strokeLinecap="round"
      filter="url(#pg-wobble)"
    />
  )
}
