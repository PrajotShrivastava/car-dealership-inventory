import { useId } from 'react'
import type { Category } from '../api/types'
import { cn } from '../components/cn'

/* Side-profile car drawings (facing right) on a 120 × 48 canvas, ground at y = 45.
   Hand-drawn SVG so the marketing pages need no image assets or licences. */
type Shape = { body: string; windows: string[]; wheels: [number, number]; r?: number }

const SHAPES: Record<Category, Shape> = {
  sedan: {
    body: 'M8 37 L8 30 Q8 26 13 25.5 L32 24 L44 15 Q47 13 52 13 L72 13 Q77 13 81 16 L92 24 L107 25.5 Q113 26.5 113 31 L113 37 Q113 38 112 38 L9 38 Q8 38 8 37 Z',
    windows: ['M36 24 L46 16 Q48 15 51 15 L60 15 L60 24 Z', 'M63 15 L71 15 Q75 15 78 17.5 L87 24 L63 24 Z'],
    wheels: [30, 92],
  },
  coupe: {
    body: 'M8 37 L8 30 Q8 27 13 26 L24 25 Q38 14 54 13 L68 13 Q75 13 80 17 L92 25 L107 26.5 Q113 27.5 113 32 L113 37 Q113 38 112 38 L9 38 Q8 38 8 37 Z',
    windows: ['M30 24.5 Q40 16 52 15 L60 15 L60 24.5 Z', 'M63 15 L68 15 Q73 15 77 18 L85 24.5 L63 24.5 Z'],
    wheels: [30, 92],
  },
  convertible: {
    body: 'M8 37 L8 29 Q8 25 13 24.5 L104 24.5 Q113 25.5 113 31 L113 37 Q113 38 112 38 L9 38 Q8 38 8 37 Z',
    windows: ['M71 24.5 L79 15.5 L81 16 L74.5 24.5 Z', 'M46 24.5 L47 19 Q47.5 18 49 18 L53 18 Q54.5 18 54.5 19.5 L54 24.5 Z'],
    wheels: [30, 92],
  },
  hatchback: {
    body: 'M12 37 L12 22 Q12 17 16 16 L22 14 Q26 12 32 12 L66 12 Q72 12 76 15 L88 23 L104 25 Q110 26 110 31 L110 37 Q110 38 109 38 L13 38 Q12 38 12 37 Z',
    windows: ['M17 22 L20 16 Q22 14 26 14 L44 14 L44 22 Z', 'M47 14 L65 14 Q70 14 73 16.5 L81 22 L47 22 Z'],
    wheels: [30, 92],
  },
  wagon: {
    body: 'M8 37 L8 22 Q8 18 12 17 L16 14 Q18 12 22 12 L72 12 Q77 12 81 15.5 L92 24 L107 25.5 Q113 26.5 113 31 L113 37 Q113 38 112 38 L9 38 Q8 38 8 37 Z',
    windows: ['M14 22 L18 15 Q19 14 22 14 L40 14 L40 22 Z', 'M43 14 L60 14 L60 22 L43 22 Z', 'M63 14 L71 14 Q75 14 78 16.5 L86 22 L63 22 Z'],
    wheels: [30, 92],
  },
  suv: {
    body: 'M8 37 L8 24 Q8 20 12 19.5 L18 19 L24 10 Q25 8 28 8 L76 8 Q80 8 83 11 L92 19 L106 21 Q112 22 112 27 L112 37 Q112 38 111 38 L9 38 Q8 38 8 37 Z',
    windows: ['M22 19 L27 11 Q28 10 30 10 L48 10 L48 19 Z', 'M51 10 L74 10 Q77 10 79 12 L86 19 L51 19 Z'],
    wheels: [28, 92],
    r: 8,
  },
  truck: {
    body: 'M6 37 L6 22 L54 22 L56 12 Q57 9 60 9 L78 9 Q82 9 85 12 L93 21 L108 23 Q113 24 113 29 L113 37 Q113 38 112 38 L7 38 Q6 38 6 37 Z',
    windows: ['M59 21 L60 13 Q60.5 11 62 11 L70 11 L70 21 Z', 'M73 11 L78 11 Q81 11 83 13 L89 21 L73 21 Z'],
    wheels: [26, 94],
    r: 8,
  },
  van: {
    body: 'M8 37 L8 10 Q8 6 12 6 L80 6 Q85 6 88 10 L98 22 L108 24 Q113 25 113 30 L113 37 Q113 38 112 38 L9 38 Q8 38 8 37 Z',
    windows: ['M44 9 L70 9 L70 18 L44 18 Z', 'M74 9 L81 9 Q84 9 86 12 L92 19 L74 19 Z'],
    wheels: [28, 94],
  },
}

/** A coloured car drawing for the given body style. Decorative. */
export function CarIllustration({ category, paint, className }: { category: Category; paint: string; className?: string }) {
  const id = useId()
  const { body, windows, wheels, r = 7 } = SHAPES[category]
  return (
    <svg aria-hidden viewBox="0 0 120 48" className={className}>
      <defs>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4b5563" />
          <stop offset="1" stopColor="#1f2937" />
        </linearGradient>
      </defs>
      <ellipse cx="60" cy="45" rx="54" ry="2.5" fill="#000" opacity="0.15" />
      <path d={body} fill={paint} stroke="#000" strokeOpacity="0.25" strokeWidth="0.75" />
      <path d={body} fill={`url(#${id}-shine)`} />
      {windows.map((d) => (
        <path key={d} d={d} fill={`url(#${id}-glass)`} />
      ))}
      <rect x="108.5" y="28" width="4" height="2.5" rx="1" fill="#fef3c7" />
      <rect x={category === 'hatchback' ? 12 : 8} y="27" width="2.5" height="3" rx="0.75" fill="#dc2626" />
      {wheels.map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={38} r={r} fill="#111" />
          <circle cx={cx} cy={38} r={r * 0.5} fill="#9ca3af" />
          <circle cx={cx} cy={38} r={r * 0.18} fill="#4b5563" />
        </g>
      ))}
    </svg>
  )
}

/** Stroke-only sports-car outline for subtle background line art. */
export function CarLineArt({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 120 48" fill="none" className={cn('overflow-visible', className)}>
      <path d={SHAPES.coupe.body} stroke="currentColor" strokeWidth="0.35" strokeLinejoin="round" />
      {SHAPES.coupe.windows.map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="0.25" strokeLinejoin="round" />
      ))}
      {SHAPES.coupe.wheels.map((cx) => (
        <g key={cx} stroke="currentColor" strokeWidth="0.3">
          <circle cx={cx} cy={38} r={7} />
          <circle cx={cx} cy={38} r={3.5} />
        </g>
      ))}
      <path d="M-30 45.5 H150" stroke="currentColor" strokeWidth="0.2" strokeDasharray="4 3" />
    </svg>
  )
}
