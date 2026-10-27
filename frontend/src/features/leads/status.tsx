import type { Lead, LeadStatus } from '../../api/types'
import { cn } from '../../components/cn'
import { formatDay } from '../../time'
import { followUpState, isClosed, STATUS_LABEL } from './statusModel'

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25',
  contacted: 'bg-slate-100 text-slate-700 ring-slate-500/20',
  test_drive_scheduled: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/25',
  negotiation: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25',
  converted: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25',
  lost: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25',
}

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        STATUS_STYLE[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

export function FollowUpDate({ lead }: { lead: Pick<Lead, 'status' | 'follow_up_on'> }) {
  if (!lead.follow_up_on) return <span className="text-slate-400">—</span>
  const state = followUpState(lead)
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <span className={cn('tabular-nums', isClosed(lead) ? 'text-slate-400' : 'text-slate-700')}>{formatDay(lead.follow_up_on)}</span>
      {state === 'overdue' && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-300">
          Overdue
        </span>
      )}
      {state === 'today' && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          Today
        </span>
      )}
    </span>
  )
}
