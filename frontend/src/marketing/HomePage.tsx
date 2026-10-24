import {
  BadgeCheck,
  Boxes,
  Gauge,
  KeyRound,
  LayoutList,
  MonitorSmartphone,
  PackagePlus,
  Search,
  ShieldCheck,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react'
import { CarLineArt } from '../components/CarIllustration'
import { DashboardPreview } from './DashboardPreview'
import { HeroMarquee } from './HeroMarquee'
import { Reveal } from './Reveal'
import { CtaBand, PrimaryCta, SecondaryCta, SectionHeading } from './ui'

const OUTCOMES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Gauge,
    title: 'Know exactly what is on the lot',
    body: 'Every model shows live stock: in stock, running low or sold out. No spreadsheets to reconcile.',
  },
  {
    icon: ShieldCheck,
    title: 'Never sell the same car twice',
    body: 'Purchases reduce stock in a single atomic step, so two buyers can’t claim the last unit.',
  },
  {
    icon: KeyRound,
    title: 'The right access for everyone',
    body: 'Customers browse and buy; staff manage listings, pricing and stock. Permissions are enforced on the server.',
  },
]

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: LayoutList, title: 'Inventory at a glance', body: 'A dense, readable list with make, model, trim, year, specs, price and stock.' },
  { icon: Search, title: 'Search and filters', body: 'Find vehicles by make, model or trim, and filter by category, price range and availability.' },
  { icon: BadgeCheck, title: 'Detailed vehicle view', body: 'A side panel with full specifications and stock status, without leaving the list.' },
  { icon: ShoppingCart, title: 'Safe purchasing', body: 'Quantity limited to available stock, with clear feedback when a car sells out.' },
  { icon: PackagePlus, title: 'Staff tools', body: 'Add vehicles, edit details and pricing, restock, and remove listings with confirmation.' },
  { icon: ShieldCheck, title: 'Secure accounts', body: 'Hashed passwords, token-based sessions and role-based permissions.' },
  { icon: Boxes, title: 'Reliable data', body: 'PostgreSQL storage with migrations and database-level stock constraints.' },
  { icon: MonitorSmartphone, title: 'Works everywhere', body: 'Responsive on desktop, tablet and phone, in light or dark mode.' },
]

const STEPS = [
  { title: 'Add your vehicles', body: 'Staff list each model with its details, price and starting stock.' },
  { title: 'Customers browse and buy', body: 'Buyers search, compare specs and purchase. Stock updates instantly.' },
  { title: 'Restock as you go', body: 'Low and sold-out badges show what needs attention; restock in a few clicks.' },
]

export function HomePage() {
  return (
    <>
      {/* Hero */}
      <section aria-label="Introduction" className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          <div className="absolute -top-40 left-1/2 h-[32rem] w-[60rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-slate-200)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-slate-200)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] bg-[size:48px_48px] opacity-50" />
        </div>
        <div className="relative pt-16 pb-24 sm:pt-24">
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Inventory management for car dealerships
              </span>
            </Reveal>
          </div>
          <Reveal delay={80} className="mt-8">
            <HeroMarquee />
          </Reveal>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <Reveal delay={160}>
                <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-600">
                  DriveStock keeps your vehicle inventory accurate in real time. Track stock, manage listings and let
                  customers buy with confidence, from one clean dashboard.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                  <PrimaryCta />
                  <SecondaryCta />
                </div>
              </Reveal>
            </div>
            <div className="relative mx-auto mt-16 max-w-5xl">
              <CarLineArt className="pointer-events-none absolute -right-60 bottom-16 hidden w-[30rem] text-brand-500/45 xl:block" />
              <Reveal delay={320} className="relative">
                <DashboardPreview />
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* How it helps */}
      <section aria-labelledby="helps-title" className="border-y border-slate-200 bg-canvas-raised py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading id="helps-title" eyebrow="Why DriveStock" title="Built around how a dealership works">
              Inventory is a dealership’s biggest asset. DriveStock makes sure everyone sees the same, correct
              picture of it.
            </SectionHeading>
          </Reveal>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {OUTCOMES.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 90}>
                <div className="space-y-3">
                  <span className="flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                  <p className="text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-label="Features" className="scroll-mt-20 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading id="features-title" eyebrow="Features" title="Everything you need to run the lot" center>
              The essentials, done well. No clutter you will never use.
            </SectionHeading>
          </Reveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={(index % 4) * 70}>
                <div className="group h-full rounded-xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-brand-500/40 hover:shadow-lg hover:shadow-brand-600/5">
                  <Icon aria-hidden className="size-6 text-brand-600 transition-transform group-hover:scale-110" />
                  <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="steps-title" className="border-t border-slate-200 bg-canvas-raised py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading id="steps-title" eyebrow="How it works" title="From listing to sale in three steps" />
          </Reveal>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Reveal delay={index * 90}>
                  <div className="relative h-full rounded-xl border border-slate-200 p-6">
                    <span className="text-sm font-semibold text-canvas-accent tabular-nums">
                      0{index + 1}
                    </span>
                    <h3 className="mt-3 font-semibold text-slate-900">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
                  </div>
                </Reveal>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <Reveal>
        <CtaBand title="See your inventory clearly">
          Create an account in a minute and explore the live inventory dashboard.
        </CtaBand>
      </Reveal>
    </>
  )
}
