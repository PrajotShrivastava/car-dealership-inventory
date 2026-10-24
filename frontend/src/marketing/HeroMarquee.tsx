import { Pause, Play } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '../components/cn'

// Copies per half: each half must be wider than the widest viewport so the loop never shows a gap.
const COPIES = 4

/**
 * One full-bleed line that scrolls forever. The track holds two identical halves and
 * moves by exactly one half per cycle, so the loop restarts on an identical frame.
 */
function MarqueeLine({
  direction,
  withCar = false,
  children,
}: {
  direction: 'left' | 'right'
  withCar?: boolean
  children: ReactNode
}) {
  return (
    <div aria-hidden className="marquee">
      <div className={cn('marquee-track', direction === 'right' ? 'marquee-to-right' : 'marquee-to-left')}>
        {[0, 1].map((half) => (
          <div key={half} className="marquee-half">
            {Array.from({ length: COPIES }, (_, i) => (
              <span key={i} className="marquee-item">
                {children}
                <span className={withCar ? 'marquee-separator' : 'marquee-gap'} />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Only the green words are italic; the extra right padding keeps the slant from clipping.
const accent = 'pr-[0.08em] text-brand-600 italic'

/** The hero headline as two opposing marquees, with a pause control (WCAG 2.2.2). */
export function HeroMarquee() {
  const [paused, setPaused] = useState(false)
  return (
    <div className={cn(paused && 'marquee-paused')}>
      <h1 className="text-[clamp(2.75rem,9vw,7.5rem)] leading-[1.08] font-extrabold tracking-tight text-slate-900">
        <span className="sr-only">Know your stock. Own your lot.</span>
        <MarqueeLine direction="right">
          <span>
            Know your <span className={accent}>stock.</span>
          </span>
        </MarqueeLine>
        <MarqueeLine direction="left" withCar>
          <span>
            Own your <span className={accent}>lot.</span>
          </span>
        </MarqueeLine>
      </h1>
      <div className="mx-auto mt-3 flex max-w-7xl justify-end px-4 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label="Pause headline animation"
          className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 backdrop-blur transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none motion-reduce:invisible"
        >
          {paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
        </button>
      </div>
    </div>
  )
}
