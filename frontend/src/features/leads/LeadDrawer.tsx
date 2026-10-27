import { CalendarClock, Pencil, Receipt } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { Lead, LeadEvent, LeadStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Drawer } from '../../components/Drawer'
import { SelectField } from '../../components/Field'
import { Spinner } from '../../components/Spinner'
import { APP_SALES } from '../../paths'
import { formatDay, localDate } from '../../time'
import { formatPrice } from '../inventory/format'
import type { RecordSaleState } from '../sales/SalesPage'
import { useLead, useUpdateLead } from './queries'
import { FollowUpDate, StatusBadge } from './status'
import { STATUS_LABEL, STATUS_OPTIONS } from './statusModel'

const QUICK_DATES = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
]

const statusName = (value: string | null) => (value ? STATUS_LABEL[value as LeadStatus].toLowerCase() : '')

function describe(event: LeadEvent): string {
  switch (event.kind) {
    case 'created':
      return event.new_value && event.new_value !== 'new' ? `Lead created as ${statusName(event.new_value)}` : 'Lead created'
    case 'status':
      return `Status changed from ${statusName(event.old_value)} to ${statusName(event.new_value)}`
    case 'follow_up':
      return event.new_value ? `Follow-up set for ${formatDay(event.new_value)}` : 'Follow-up cleared'
    case 'sale':
      return `Sale #${event.new_value} recorded`
  }
}

const when = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const added = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-900">{children}</dd>
    </div>
  )
}

export function LeadDrawer({ id, onClose, onEdit }: { id: number; onClose: () => void; onEdit: (lead: Lead) => void }) {
  const { data: lead, isError, error } = useLead(id)
  const update = useUpdateLead()
  const navigate = useNavigate()
  const [customDate, setCustomDate] = useState('')

  const change = (changes: Partial<Lead>) => lead && update.mutate({ id: lead.id, changes })

  if (!lead) {
    return (
      <Drawer title="Lead" onClose={onClose}>
        <div className="p-6">{isError ? <Alert>{error.message}</Alert> : <Spinner />}</div>
      </Drawer>
    )
  }

  const recordSale = () =>
    navigate(APP_SALES, {
      state: {
        recordSale: { leadId: lead.id, vehicleId: lead.vehicle_id, name: lead.name, email: lead.email, phone: lead.phone },
      } satisfies RecordSaleState,
    })

  return (
    <Drawer
      title={lead.name}
      subtitle={<StatusBadge status={lead.status} />}
      onClose={onClose}
      actions={
        <Button variant="secondary" size="sm" icon={<Pencil aria-hidden className="size-3.5" />} onClick={() => onEdit(lead)}>
          Edit details
        </Button>
      }
      footer={
        lead.sale_id ? (
          <Link
            to={`${APP_SALES}?sale=${lead.sale_id}`}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Receipt aria-hidden className="size-4" />
            View sale #{lead.sale_id}
          </Link>
        ) : lead.status !== 'lost' ? (
          <Button className="w-full" icon={<Receipt aria-hidden className="size-4" />} onClick={recordSale}>
            Record sale
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6 px-6 py-5">
        {update.isError && <Alert>{update.error.message}</Alert>}

        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <SelectField
            label="Status"
            value={lead.status}
            disabled={Boolean(lead.sale_id) || update.isPending}
            onChange={(e) => change({ status: e.target.value as LeadStatus })}
            options={STATUS_OPTIONS}
          />
          {lead.sale_id && <p className="text-xs text-slate-500">Converted by a recorded sale, so the status stays Converted.</p>}
          <div>
            <p className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
              <CalendarClock aria-hidden className="size-4 text-slate-400" />
              Next follow-up: <FollowUpDate lead={lead} />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {QUICK_DATES.map(({ label, days }) => (
                <Button key={label} variant="secondary" size="sm" disabled={update.isPending} onClick={() => change({ follow_up_on: localDate(days) })}>
                  {label}
                </Button>
              ))}
              <input
                type="date"
                aria-label="Follow-up date"
                min={localDate()}
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-8 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={!customDate || update.isPending}
                onClick={() => {
                  change({ follow_up_on: customDate })
                  setCustomDate('')
                }}
              >
                Set
              </Button>
              {lead.follow_up_on && (
                <Button variant="secondary" size="sm" disabled={update.isPending} onClick={() => change({ follow_up_on: null })}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </section>

        <dl className="grid grid-cols-2 gap-4">
          <Detail label="Email">{lead.email ? <a className="text-brand-600 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : '—'}</Detail>
          <Detail label="Phone">{lead.phone ? <a className="text-brand-600 hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a> : '—'}</Detail>
          <Detail label="Interested in">
            {lead.vehicle_label ?? '—'}
            {lead.vehicle_label && lead.vehicle_id === null && <span className="block text-xs text-slate-500">Removed from inventory</span>}
          </Detail>
          <Detail label="Budget">{lead.budget ? formatPrice(lead.budget) : '—'}</Detail>
          <Detail label="Source">{lead.source ?? '—'}</Detail>
          <Detail label="Added">{added.format(new Date(lead.created_at))}</Detail>
        </dl>
        {lead.notes && (
          <div>
            <h3 className="text-xs text-slate-500">Notes</h3>
            <p className="mt-1 text-sm whitespace-pre-line text-slate-900">{lead.notes}</p>
          </div>
        )}

        <section>
          <h3 id={`history-${lead.id}`} className="text-sm font-semibold text-slate-900">
            History
          </h3>
          <ol aria-labelledby={`history-${lead.id}`} className="mt-3 space-y-3 border-l border-slate-200 pl-4">
            {[...lead.events].reverse().map((event, i) => (
              <li key={i} className="relative">
                <span aria-hidden className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-slate-300" />
                <p className="text-sm text-slate-900">{describe(event)}</p>
                <p className="text-xs text-slate-500">{when.format(new Date(event.created_at))}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </Drawer>
  )
}
