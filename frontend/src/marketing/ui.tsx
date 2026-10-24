import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../components/cn'

export function Eyebrow({ children, inverted = false }: { children: ReactNode; inverted?: boolean }) {
  return (
    <p
      className={cn(
        'text-xs font-semibold tracking-[0.18em] uppercase',
        inverted ? 'text-brand-300' : 'text-canvas-accent',
      )}
    >
      {children}
    </p>
  )
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  center = false,
}: {
  id?: string
  eyebrow: string
  title: string
  children?: ReactNode
  center?: boolean
}) {
  return (
    <div className={cn('max-w-2xl space-y-3', center && 'mx-auto text-center')}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
        {title}
      </h2>
      {children && <p className="text-base leading-relaxed text-slate-600">{children}</p>}
    </div>
  )
}

export function PrimaryCta({ to = '/signup', children = 'Get Started', className }: { to?: string; children?: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-on-brand shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-brand-600/35',
        className,
      )}
    >
      {children}
      <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

export function SecondaryCta({ to = '/login', children = 'Sign In', inverted = false }: { to?: string; children?: ReactNode; inverted?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex h-12 items-center justify-center rounded-lg px-6 text-sm font-semibold transition hover:-translate-y-0.5',
        inverted
          ? 'border border-on-accent/25 text-on-accent hover:bg-on-accent/10'
          : 'border border-slate-300 bg-white text-slate-800 hover:border-slate-400',
      )}
    >
      {children}
    </Link>
  )
}

/** Navy closing band shared by marketing pages. */
export function CtaBand({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label="Get started" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-5xl overflow-hidden rounded-2xl bg-ink-900 px-6 py-14 text-center sm:px-12">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative space-y-5">
          <h2 className="text-3xl font-semibold tracking-tight text-on-accent sm:text-4xl">{title}</h2>
          <p className="mx-auto max-w-xl text-nav-text">{children}</p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <PrimaryCta />
            <SecondaryCta inverted />
          </div>
        </div>
      </div>
    </section>
  )
}
