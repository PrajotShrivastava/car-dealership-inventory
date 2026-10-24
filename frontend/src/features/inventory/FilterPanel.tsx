import { ChevronDown, Search, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { CATEGORIES, type Availability, type VehicleList } from '../../api/types'
import { cn } from '../../components/cn'
import { SelectField, TextField } from '../../components/Field'
import { titleCase } from './format'
import type { Filters, TextDrafts } from './useInventoryFilters'

interface FilterPanelProps {
  filters: Filters
  drafts: TextDrafts
  onDraftChange: (changes: Partial<TextDrafts>) => void
  counts?: VehicleList['counts']
  activeCount: number
  onChange: (changes: Partial<Filters>) => void
  onClear: () => void
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <section className="border-t border-slate-200 px-5 py-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between text-sm font-semibold text-slate-900"
      >
        {title}
        <ChevronDown aria-hidden className={cn('size-4 text-slate-500 transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  )
}

const AVAILABILITY_OPTIONS: { value: Availability; label: string; countKey: keyof VehicleList['counts'] }[] = [
  { value: 'all', label: 'All vehicles', countKey: 'all' },
  { value: 'in_stock', label: 'In stock', countKey: 'in_stock' },
  { value: 'out_of_stock', label: 'Out of stock', countKey: 'out_of_stock' },
]

export function FilterPanel({ filters, drafts, onDraftChange, counts, activeCount, onChange, onClear }: FilterPanelProps) {

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex h-14 items-center justify-between px-5">
        <h2 className="text-sm font-semibold text-slate-900">Filters ({activeCount})</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <X aria-hidden className="size-4" />
            Clear all
          </button>
        )}
      </div>

      <Section title="Search">
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            aria-label="Search"
            placeholder="Make, model or trim…"
            value={drafts.q}
            onChange={(e) => onDraftChange({ q: e.target.value })}
            className="block h-10 w-full rounded-md border border-slate-300 bg-white pr-3 pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
          />
        </div>
      </Section>

      <Section title="Vehicle type">
        <SelectField
          label="Category"
          value={filters.category}
          onChange={(e) => onChange({ category: e.target.value as Filters['category'] })}
          options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: titleCase(c) }))]}
        />
      </Section>

      <Section title="Price">
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Min price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="$0"
            value={drafts.min_price}
            onChange={(e) => onDraftChange({ min_price: e.target.value })}
          />
          <TextField
            label="Max price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Any"
            value={drafts.max_price}
            onChange={(e) => onDraftChange({ max_price: e.target.value })}
          />
        </div>
      </Section>

      <Section title="Availability">
        <div role="radiogroup" aria-label="Availability" className="space-y-2.5">
          {AVAILABILITY_OPTIONS.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
              <input
                type="radio"
                name="availability"
                value={option.value}
                checked={filters.availability === option.value}
                onChange={() => onChange({ availability: option.value })}
                className="size-4 accent-brand-600"
              />
              <span className="flex-1">{option.label}</span>
              <span className="text-xs text-slate-500 tabular-nums">{counts?.[option.countKey] ?? '–'}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  )
}
