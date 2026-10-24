import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { cn } from '../components/cn'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../theme/ThemeToggle'

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/#features', label: 'Features' },
  { to: '/about', label: 'About' },
  { to: '/pricing', label: 'Pricing' },
]

const linkClass = 'text-sm font-medium text-slate-600 transition-colors hover:text-slate-900'

function AuthActions({ stacked = false, onNavigate }: { stacked?: boolean; onNavigate?: () => void }) {
  const { status } = useAuth()
  const primary =
    'inline-flex h-10 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-medium text-on-accent shadow-sm transition hover:bg-brand-700'
  if (status === 'authenticated') {
    return (
      <Link to="/app" onClick={onNavigate} className={primary}>
        Open dashboard
      </Link>
    )
  }
  return (
    <div className={cn('flex items-center gap-3', stacked && 'flex-col items-stretch')}>
      <Link to="/login" onClick={onNavigate} className={cn(linkClass, stacked && 'py-2 text-center')}>
        Sign In
      </Link>
      <Link to="/signup" onClick={onNavigate} className={primary}>
        Get Started
      </Link>
    </div>
  )
}

function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const close = () => setOpen(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors duration-300',
        scrolled || open
          ? 'border-slate-200 bg-white/80 backdrop-blur-lg'
          : 'border-transparent bg-transparent',
      )}
    >
      <nav aria-label="Primary" className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <Link to="/" onClick={close} aria-label="DriveStock home">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(linkClass, isActive && !link.to.includes('#') && 'text-slate-900')
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="ml-auto hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <AuthActions />
        </div>
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((value) => !value)}
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>
      {open && (
        <div id="mobile-menu" className="animate-fade-in border-t border-slate-200 px-4 pt-2 pb-5 md:hidden">
          <ul className="space-y-1">
            {LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={close}
                  className="block rounded-md px-3 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <AuthActions stacked onNavigate={close} />
          </div>
        </div>
      )}
    </header>
  )
}

function Footer() {
  return (
    <footer className="border-t border-slate-200">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="space-y-2">
          <Logo />
          <p className="text-sm text-slate-500">Inventory management for car dealerships.</p>
        </div>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[...LINKS.slice(1), { to: '/login', label: 'Sign In' }, { to: '/signup', label: 'Get Started' }].map(
            (link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-slate-500 hover:text-slate-900">
                  {link.label}
                </Link>
              </li>
            ),
          )}
        </ul>
      </div>
    </footer>
  )
}

/** Scroll to #hash targets (e.g. /#features) and to the top on page changes. */
function useScrollToHash() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    } else {
      window.scrollTo?.({ top: 0 })
    }
  }, [pathname, hash])
}

export function MarketingLayout() {
  useScrollToHash()
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
