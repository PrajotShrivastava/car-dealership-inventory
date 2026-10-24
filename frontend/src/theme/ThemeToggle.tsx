import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../components/cn'
import { applyTheme, initialTheme, saveTheme, type Theme } from './theme'

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => applyTheme(theme), [theme])

  const next: Theme = theme === 'dark' ? 'light' : 'dark'
  const toggle = () => {
    saveTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'rounded-md p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        className,
      )}
    >
      {theme === 'dark' ? <Sun aria-hidden className="size-[18px]" /> : <Moon aria-hidden className="size-[18px]" />}
    </button>
  )
}
