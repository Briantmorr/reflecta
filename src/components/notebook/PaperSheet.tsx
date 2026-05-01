import { ReactNode } from 'react'

interface PaperSheetProps {
  x: number
  y: number
  w: number
  h: number
  rotate?: number
  earSize?: number
  side?: 'tr' | 'br' | 'bl'
  tint?: string
  shadow?: boolean
  children?: ReactNode
}

export function PaperSheet({
  x,
  y,
  w,
  h,
  rotate = 0,
  earSize = 44,
  side = 'br',
  tint = '#fbf5e4',
  shadow = true,
  children,
}: PaperSheetProps) {
  const ear = Math.max(20, earSize)
  const d =
    side === 'br'
      ? `M0,0 L${w},0 L${w},${h - ear} L${w - ear},${h} L0,${h} Z`
      : side === 'tr'
        ? `M0,0 L${w - ear},0 L${w},${ear} L${w},${h} L0,${h} Z`
        : `M0,0 L${w},0 L${w},${h} L${ear},${h} L0,${h - ear} Z`
  const clipId = `pg-clip-${Math.round(x * 13 + y * 7 + w * 3)}`

  return (
    <g transform={`translate(${x},${y}) rotate(${rotate})`}>
      <defs>
        <clipPath id={clipId}><path d={d} /></clipPath>
      </defs>
      {shadow && <path d={d} transform="translate(1,4)" fill="rgba(40,28,14,0.18)" filter="url(#pg-wobble)" />}
      <g clipPath={`url(#${clipId})`}>
        <rect width={w} height={h} fill={tint} />
        <rect width={w} height={h} fill="white" filter="url(#pg-grain)" opacity="0.9" />
        <rect width={w} height={h} fill="white" filter="url(#pg-fox)" opacity="0.35" />
        <rect width={w} height={h} fill="none" stroke="rgba(90,66,30,0.18)" strokeWidth="1" />
        {children}
      </g>
      {side === 'br' && (
        <>
          <path d={`M${w - ear},${h} L${w},${h - ear} L${w - ear * 0.4},${h - ear * 0.4} Z`} fill="#e9dec0" stroke="rgba(90,66,30,0.35)" strokeWidth="0.6" />
          <path d={`M${w - ear},${h} L${w - ear * 0.4},${h - ear * 0.4}`} stroke="rgba(90,66,30,0.18)" strokeWidth="0.8" fill="none" />
        </>
      )}
      {side === 'tr' && (
        <path d={`M${w - ear},0 L${w},${ear} L${w - ear * 0.4},${ear * 0.4} Z`} fill="#e9dec0" stroke="rgba(90,66,30,0.35)" strokeWidth="0.6" />
      )}
    </g>
  )
}
