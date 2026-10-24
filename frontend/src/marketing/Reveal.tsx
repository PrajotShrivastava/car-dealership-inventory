import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../components/cn'

/** Fades its children in when scrolled into view (CSS handles reduced motion). */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')

  useEffect(() => {
    const node = ref.current
    if (!node || visible) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }} className={cn('reveal', visible && 'is-visible', className)}>
      {children}
    </div>
  )
}
