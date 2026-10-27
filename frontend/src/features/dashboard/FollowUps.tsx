import { Link } from 'react-router'
import type { FollowUps as FollowUpsData } from '../../api/types'
import { APP_LEADS } from '../../paths'
import { FollowUpDate, StatusBadge } from '../leads/status'
import { Panel, PanelEmpty } from './Panel'

/** Open leads due for a follow-up: overdue, today and the next 7 days. */
export function FollowUps({ data }: { data: FollowUpsData }) {
  const summary = [
    data.overdue && `${data.overdue} overdue`,
    data.today && `${data.today} due today`,
    data.upcoming && `${data.upcoming} in the next 7 days`,
  ].filter(Boolean)
  return (
    <Panel
      title="Follow-ups"
      description={summary.length ? summary.join(' · ') : 'Leads to contact soon'}
      actions={
        <Link to={APP_LEADS} className="text-sm font-medium text-brand-600 hover:underline">
          All leads
        </Link>
      }
    >
      {data.items.length === 0 ? (
        <PanelEmpty title="No follow-ups due">Leads with a follow-up in the next 7 days appear here.</PanelEmpty>
      ) : (
        <ul className="-mx-2 divide-y divide-slate-100">
          {data.items.map((lead) => (
            <li key={lead.id}>
              <Link to={`${APP_LEADS}?lead=${lead.id}`} className="flex items-start justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{lead.name}</span>
                  <span className="block truncate text-xs text-slate-500">{lead.vehicle_label ?? 'No vehicle chosen'}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs">
                  <FollowUpDate lead={lead} />
                  <StatusBadge status={lead.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
