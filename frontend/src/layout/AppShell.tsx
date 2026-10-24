import { CarFront, LogOut, Menu, PanelLeftClose, PanelLeftOpen, UserCheck, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { cn } from '../components/cn'
import { Logo } from '../components/Logo'
import { ApplicationBanner } from '../features/dealers/ApplicationBanner'
import { usePendingApplications } from '../features/dealers/queries'
import { ThemeToggle } from '../theme/ThemeToggle'

const COLLAPSE_KEY = 'drivestock.sidebarCollapsed'

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/** `rail` = icon-only; `responsive` = icon-only on tablet, full on desktop. */
type NavMode = 'full' | 'rail' | 'responsive'

function SidebarLink({
  to,
  label,
  icon: Icon,
  mode,
  badge,
  onNavigate,
}: {
  to: string
  label: string
  icon: LucideIcon
  mode: NavMode
  badge?: number
  onNavigate?: () => void
}) {
  const hideText = mode === 'rail' ? 'sr-only' : mode === 'responsive' ? 'max-lg:sr-only' : ''
  return (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      title={mode === 'full' ? undefined : label}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-ink-800 text-on-accent shadow-[inset_3px_0_0_var(--color-brand-500)]'
            : 'text-nav-text hover:bg-ink-800/60 hover:text-on-accent',
          mode === 'rail' && 'justify-center px-0',
          mode === 'responsive' && 'max-lg:justify-center max-lg:px-0',
        )
      }
    >
      <Icon aria-hidden className="size-[18px] shrink-0" />
      <span className={hideText}>{label}</span>
      {badge ? (
        <span
          className={cn(
            'ml-auto rounded-full bg-amber-400 px-1.5 text-[11px] font-semibold text-ink-900 tabular-nums',
            mode !== 'full' && 'absolute top-0.5 right-1 ml-0',
            mode === 'responsive' && 'lg:static lg:ml-auto',
          )}
        >
          {badge}
        </span>
      ) : null}
    </NavLink>
  )
}

function SidebarNav({ mode, onNavigate }: { mode: NavMode; onNavigate?: () => void }) {
  const { isAdmin } = useAuth()
  const { data: pending } = usePendingApplications(isAdmin)
  const heading = (text: string) =>
    mode !== 'rail' && (
      <p
        className={cn(
          'px-3 pt-4 pb-2 text-[11px] font-medium tracking-wide text-nav-muted uppercase first:pt-0',
          mode === 'responsive' && 'max-lg:hidden',
        )}
      >
        {text}
      </p>
    )
  return (
    <nav aria-label="Main" className="flex-1 space-y-1 px-3 py-4">
      {heading('Inventory')}
      <SidebarLink to="/app" label="Vehicles" icon={CarFront} mode={mode} onNavigate={onNavigate} />
      {isAdmin && (
        <>
          {heading('Administration')}
          <SidebarLink
            to="/app/dealer-applications"
            label="Dealer applications"
            icon={UserCheck}
            mode={mode}
            badge={pending?.length}
            onNavigate={onNavigate}
          />
        </>
      )}
    </nav>
  )
}

export function AppShell() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? '0' : '1')
      } catch {
        // per-viewer convenience only
      }
      return !value
    })
  }

  return (
    <div className="flex h-full">
      {/* Desktop / tablet sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col bg-ink-900 transition-[width] md:flex',
          collapsed ? 'w-[72px]' : 'w-[72px] lg:w-60',
        )}
      >
        <div
          className={cn(
            'flex h-16 items-center border-b border-on-accent/10',
            collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:px-5',
          )}
        >
          <span className={cn(!collapsed && 'lg:hidden')}>
            <Logo inverted compact />
          </span>
          {!collapsed && (
            <span className="hidden lg:inline">
              <Logo inverted />
            </span>
          )}
        </div>
        <SidebarNav mode={collapsed ? 'rail' : 'responsive'} />
        <button
          type="button"
          onClick={toggleCollapsed}
          className={cn(
            'hidden h-12 items-center gap-3 border-t border-on-accent/10 bg-ink-950/40 text-sm text-nav-text hover:text-on-accent lg:flex',
            collapsed ? 'justify-center' : 'px-6',
          )}
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="size-[18px]" /> : <PanelLeftClose aria-hidden className="size-[18px]" />}
          <span className={cn(collapsed && 'sr-only')}>{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</span>
        </button>
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="relative flex h-full w-64 flex-col bg-ink-900">
            <div className="flex h-16 items-center justify-between border-b border-on-accent/10 px-5">
              <Logo inverted />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                className="rounded p-1 text-nav-text hover:text-on-accent"
              >
                <X className="size-5" />
              </button>
            </div>
            <SidebarNav mode="full" onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMobileOpen(true)}
            className="-ml-1 rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <span className="md:hidden">
            <Logo compact />
          </span>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-3">
                <div className="hidden text-right sm:block">
                  <p className="text-[13px] leading-tight font-medium text-slate-900">{user.full_name}</p>
                  <p className="text-xs leading-tight text-slate-500">{user.email}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize',
                    user.role === 'admin'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300'
                      : 'bg-brand-50 text-brand-700',
                  )}
                >
                  {user.role}
                </span>
                <span
                  aria-hidden
                  className="flex size-8 items-center justify-center rounded-full bg-amber-300 text-xs font-semibold text-ink-900"
                >
                  {initials(user.full_name)}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={logout}
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden lg:inline">Sign out</span>
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ApplicationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
