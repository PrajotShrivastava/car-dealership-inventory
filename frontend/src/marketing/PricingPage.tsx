import { Check, Info } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '../components/cn'
import { Reveal } from './Reveal'
import { Eyebrow } from './ui'

interface Plan {
  name: string
  price: string
  period?: string
  description: string
  features: string[]
  cta: string
  highlighted?: boolean
}

// Placeholder plans: names, prices and limits are illustrative and not enforced anywhere.
const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    description: 'For a small lot getting organised.',
    features: ['All inventory features', 'Up to 50 vehicle listings', '1 staff account'],
    cta: 'Get Started',
  },
  {
    name: 'Professional',
    price: '$79',
    period: '/month',
    description: 'For busy dealerships with a larger team.',
    features: ['All inventory features', 'Up to 500 vehicle listings', 'Up to 10 staff accounts'],
    cta: 'Get Started',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    description: 'For groups running several locations.',
    features: ['All inventory features', 'Unlimited listings and staff', 'Multiple dealerships (planned)'],
    cta: 'Get Started',
  },
]

const FAQ = [
  {
    q: 'Are these prices final?',
    a: 'No. All plans, prices and limits on this page are placeholders while pricing is being decided.',
  },
  {
    q: 'Will I be charged if I sign up?',
    a: 'No. DriveStock does not take payments or store payment details. Signing up creates a free account.',
  },
  {
    q: 'Are the plan limits enforced?',
    a: 'Not yet. Every account currently has the same features; limits shown here are illustrative only.',
  },
]

export function PricingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[50rem] -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 pt-20 pb-10 text-center sm:px-6">
          <Reveal>
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Simple pricing</h1>
            <p className="mt-5 text-lg text-slate-600">Plans that grow with your dealership.</p>
            <div
              role="note"
              className="mx-auto mt-8 flex max-w-xl items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
            >
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong>Placeholder pricing.</strong> Plans, prices and limits are not final and are not enforced. No
                payment is taken.
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="pb-20">
        <ul aria-label="Plans" className="mx-auto grid max-w-6xl gap-6 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          {PLANS.map((plan, index) => (
            <li key={plan.name}>
              <Reveal delay={index * 90} className="h-full">
                <div
                  className={cn(
                    'relative flex h-full flex-col rounded-2xl border bg-white p-7 transition duration-300 hover:-translate-y-1',
                    plan.highlighted
                      ? 'border-brand-500 shadow-xl shadow-brand-600/10 ring-1 ring-brand-500'
                      : 'border-slate-200 hover:shadow-lg',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      Placeholder
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight text-slate-900">{plan.price}</span>
                    {plan.period && <span className="text-sm text-slate-500">{plan.period}</span>}
                  </p>
                  <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex gap-2.5">
                        <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-brand-600" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to="/signup"
                    className={cn(
                      'mt-8 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition',
                      plan.highlighted
                        ? 'bg-brand-600 text-on-brand hover:bg-brand-700'
                        : 'border border-slate-300 text-slate-800 hover:border-slate-400 hover:bg-slate-50',
                    )}
                  >
                    {plan.cta}
                  </Link>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="faq-title" className="border-t border-slate-200 bg-white py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 id="faq-title" className="text-2xl font-semibold text-slate-900">
            Questions
          </h2>
          <dl className="mt-8 divide-y divide-slate-200">
            {FAQ.map(({ q, a }) => (
              <div key={q} className="py-5">
                <dt className="font-medium text-slate-900">{q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-600">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
