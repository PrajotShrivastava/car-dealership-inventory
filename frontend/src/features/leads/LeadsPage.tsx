import { AlertTriangle, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Handshake, Plus } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FollowUpFilter, Lead, LeadStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Spinner } from '../../components/Spinner'
import { cn } from '../../components/cn'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { viewerTimeZone } from '../../time'
import { formatPrice } from '../inventory/format'
import { LeadDrawer } from './LeadDrawer'
import { LeadFormDrawer } from './LeadFormDrawer'
import { useLeads, useUpdateLead } from './queries'
import { FollowUpDate, StatusBadge } from './status'
import { STATUS_OPTIONS } from './statusModel'

const PAGE_SIZE = 20

const control =
  'h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none'

const REMINDERS: { value: Exclude<FollowUpFilter, 'none'>; label: string; icon: typeof AlertTriangle; tone: string }[] = [
  { value: 'overdue', label: 'Overdue', icon: AlertTriangle, tone: 'text-red-600 dark:text-red-300' },
  { value: 'today', label: 'Due today', icon: CalendarCheck, tone: 'text-amber-600 dark:text-amber-300' },
  { value: 'upcoming', label: 'Next 7 days', icon: CalendarDays, tone: 'text-brand-600' },
]

function StatusSelect({ lead }: { lead: Lead }) {
  const update = useUpdateLead()
  return (
    <select
      aria-label={`Status for ${lead.name}`}
      value={lead.status}
      disabled={Boolean(lead.sale_id) || update.isPending}
      title={lead.sale_id ? 'Converted by a recorded sale' : undefined}
      onChange={(e) => update.mutate({ id: lead.id, changes: { status: e.target.value as LeadStatus } })}
      className="h-8 rounded-md border border-slate-300 bg-white px-2 pr-7 text-xs text-slate-700 disabled:bg-slate-50"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function LeadsPage() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<LeadStatus | ''>('')
  const [followUp, setFollowUp] = useState<FollowUpFilter | ''>('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  const search = useDebouncedValue(q.trim(), 300)

  const query = {
    q: search || undefined,
    status: status || undefined,
    follow_up: followUp || undefined,
    tz: viewerTimeZone(),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }
  const { data, isPending, isError, error, refetch, isFetching } = useLeads(query)
  const selected = Number(params.get('lead')) || null
  const filtered = Boolean(query.q || query.status || query.follow_up)
  const total = data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const select = (id: number | null) =>
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (id === null) next.delete('lead')
      else next.set('lead', String(id))
      return next
    })

  return (
    <div className="mx-auto max-w-[1760px] p-4 sm:p-6 lg:py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads</h1>
          <p className="mt-1 text-sm text-canvas-muted">People interested in your vehicles, and when to follow up.</p>
        </div>
        <Button icon={<Plus aria-hidden className="size-4" />} onClick={() => setEditing('new')}>
          New lead
        </Button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Follow-up reminders" role="group">
        {REMINDERS.map(({ value, label, icon: Icon, tone }) => {
          const count = data?.reminders[value] ?? 0
          const active = followUp === value
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              aria-label={`${label} ${count}`}
              onClick={() => {
                setFollowUp(active ? '' : value)
                setPage(1)
              }}
              className={cn(
                'flex items-center gap-3 rounded-lg border bg-white px-4 py-3 text-left transition-colors',
                active ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-200 hover:border-slate-300',
              )}
            >
              <Icon aria-hidden className={cn('size-5 shrink-0', tone)} />
              <span className="text-sm text-slate-600">{label}</span>
              <span className="ml-auto text-lg font-semibold text-slate-900 tabular-nums">{count}</span>
            </button>
          )
        })}
      </div>

      <section className="@container min-w-0 rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium text-slate-500">
            Search
            <input
              type="search"
              aria-label="Search leads"
              placeholder="Name, email, phone or vehicle"
              value={q}
              onChange={(e) => {
                setQ(e.target.value)
                setPage(1)
              }}
              className={control}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as LeadStatus | '')
                setPage(1)
              }}
              className={control}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} ({data?.counts[option.value] ?? 0})
                </option>
              ))}
            </select>
          </label>
          {isFetching && !isPending && <Spinner className="mb-2 text-slate-400" />}
        </div>

        {isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Spinner /> Loading leads…
          </div>
        ) : isError ? (
          <div className="p-6">
            <Alert>
              <p>{error.message}</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => refetch()}>
                Try again
              </Button>
            </Alert>
          </div>
        ) : data.items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Handshake aria-hidden className="size-6" />
            </span>
            <p className="text-sm font-semibold text-slate-900">{filtered ? 'No leads match your filters' : 'No leads yet'}</p>
            <p className="max-w-xs text-sm text-slate-500">
              {filtered ? 'Try another status or clear the search.' : 'Add the people asking about your vehicles and plan when to follow up.'}
            </p>
            {!filtered && (
              <Button size="sm" icon={<Plus aria-hidden className="size-3.5" />} onClick={() => setEditing('new')}>
                New lead
              </Button>
            )}
          </div>
        ) : (
          <table aria-label="Leads" className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/60 text-xs font-medium text-slate-500">
              <tr>
                <th scope="col" className="py-3 pr-3 pl-4 font-medium sm:pl-6">Lead</th>
                <th scope="col" className="hidden px-3 py-3 font-medium @3xl:table-cell">Interested in</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="hidden px-3 py-3 font-medium @xl:table-cell">Next follow-up</th>
                <th scope="col" className="hidden px-3 py-3 text-right font-medium @4xl:table-cell">Budget</th>
                <th scope="col" className="hidden px-3 py-3 font-medium @5xl:table-cell">Source</th>
                <th scope="col" className="py-3 pr-4 pl-3 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50/60">
                  <td className="py-3 pr-3 pl-4 sm:pl-6">
                    <p className="font-medium text-slate-900">{lead.name}</p>
                    <p className="text-xs text-slate-500">{[lead.email, lead.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
                    <div className="mt-1 text-xs @xl:hidden">
                      <FollowUpDate lead={lead} />
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 text-slate-700 @3xl:table-cell">{lead.vehicle_label ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      <StatusBadge status={lead.status} className="@max-xl:whitespace-normal" />
                      {/* Quick change where there's room; on phones it's in the lead's details. */}
                      <div className="hidden @2xl:block">
                        <StatusSelect lead={lead} />
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-3 py-3 @xl:table-cell">
                    <FollowUpDate lead={lead} />
                  </td>
                  <td className="hidden px-3 py-3 text-right text-slate-700 tabular-nums @4xl:table-cell">
                    {lead.budget ? formatPrice(lead.budget) : '—'}
                  </td>
                  <td className="hidden px-3 py-3 text-slate-700 @5xl:table-cell">{lead.source ?? '—'}</td>
                  <td className="py-3 pr-4 pl-3 text-right sm:pr-6">
                    <Button variant="secondary" size="sm" aria-label={`Open ${lead.name}`} onClick={() => select(lead.id)}>
                      <span className="hidden @xl:inline">Details</span>
                      <ChevronRight aria-hidden className="size-4 @xl:hidden" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 sm:px-6">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <span className="tabular-nums">
                {page} / {pageCount}
              </span>
              <Button variant="secondary" size="sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {selected !== null && editing === null && (
        <LeadDrawer id={selected} onClose={() => select(null)} onEdit={(lead) => setEditing(lead)} />
      )}
      {editing !== null && (
        <LeadFormDrawer
          lead={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(lead) => {
            setEditing(null)
            if (editing === 'new') select(lead.id)
          }}
        />
      )}
    </div>
  )
}
