import { Building2, Compass, Crosshair, ShieldCheck, Sparkles, Users, type LucideIcon } from 'lucide-react'
import { Reveal } from './Reveal'
import { CtaBand, Eyebrow, SectionHeading } from './ui'

const AUDIENCE: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: 'Dealership owners and managers',
    body: 'Who need an accurate, current view of stock and want fewer surprises at the end of the day.',
  },
  {
    icon: Users,
    title: 'Sales and inventory staff',
    body: 'Who add listings, keep prices current and restock models as they sell.',
  },
  {
    icon: Compass,
    title: 'Car buyers',
    body: 'Who want to see what is really available, compare specifications and buy without back-and-forth.',
  },
]

const PRINCIPLES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Crosshair, title: 'Accuracy first', body: 'Stock numbers you can trust, protected at the database level.' },
  { icon: Sparkles, title: 'Simple by design', body: 'Focused on the core inventory workflow, with no feature clutter.' },
  { icon: ShieldCheck, title: 'Secure by default', body: 'Permissions are enforced on the server, not just hidden in the interface.' },
]

export function AboutPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[50rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-16 text-center sm:px-6">
          <Reveal>
            <Eyebrow>About</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">About DriveStock</h1>
            <p className="mt-6 text-lg leading-relaxed text-slate-600">
              DriveStock is inventory software for car dealerships: one place to see, manage and sell the vehicles
              on your lot.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Our mission" title="Our mission">
              To give every dealership a clear, trustworthy picture of its inventory, so staff spend less time
              checking stock and more time helping customers.
            </SectionHeading>
          </Reveal>
          <Reveal delay={100}>
            <SectionHeading eyebrow="Purpose" title="Why DriveStock exists">
              Inventory changes all day: cars sell, new stock arrives, prices move. When that information lives in
              spreadsheets or someone’s head, mistakes happen, like selling a car that is already gone. DriveStock
              keeps a single, live record that customers and staff share.
            </SectionHeading>
          </Reveal>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Audience" title="Who it’s for" />
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {AUDIENCE.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 90}>
                <div className="h-full rounded-xl border border-slate-200 bg-white p-6">
                  <Icon aria-hidden className="size-6 text-brand-600 dark:text-blue-400" />
                  <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <SectionHeading eyebrow="Principles" title="What guides the product" />
          </Reveal>
          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {PRINCIPLES.map(({ icon: Icon, title, body }, index) => (
              <Reveal key={title} delay={index * 90}>
                <div className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-blue-300">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-900">{title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Reveal>
        <CtaBand title="Try DriveStock">Create an account and explore the inventory dashboard.</CtaBand>
      </Reveal>
    </>
  )
}
