import { useId } from 'react'
import { cn } from './cn'

interface TabsProps<T extends string> {
  tabs: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: TabsProps<T>) {
  const id = useId()
  return (
    <div role="tablist" aria-label={label} className="flex gap-6 border-b border-slate-200 px-6">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          id={`${id}-${tab.value}`}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            '-mb-px border-b-2 py-3 text-sm font-medium',
            value === tab.value
              ? 'border-brand-600 text-brand-700 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
