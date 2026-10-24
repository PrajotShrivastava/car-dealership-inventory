import { BadgeCheck, Gauge, ShieldCheck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../theme/ThemeToggle'

const YEAR = new Date().getFullYear()

const highlights = [
  { icon: Gauge, text: 'Live stock levels for every model on the lot' },
  { icon: BadgeCheck, text: 'Fast search by make, model, category and price' },
  { icon: ShieldCheck, text: 'Role-based access for customers and staff' },
]

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full">
      <aside className="hidden w-[42%] max-w-xl flex-col justify-between bg-navy-900 p-12 text-on-accent lg:flex">
        <Link to="/" aria-label="DriveStock home" className="self-start">
          <Logo inverted />
        </Link>
        <div className="space-y-8">
          <h2 className="text-3xl leading-tight font-semibold">
            Your dealership inventory,
            <br />
            clear at a glance.
          </h2>
          <ul className="space-y-4">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-nav-text">
                <span className="flex size-8 items-center justify-center rounded-md bg-navy-800">
                  <Icon aria-hidden className="size-4 text-brand-100" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-nav-muted">© {YEAR} DriveStock</p>
      </aside>
      <main className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <ThemeToggle className="absolute top-4 right-4" />
        <div className="w-full max-w-sm">
          <Link to="/" aria-label="DriveStock home" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
