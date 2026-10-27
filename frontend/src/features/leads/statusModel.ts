import { LEAD_STATUSES, type Lead, type LeadStatus } from '../../api/types'
import { localDate } from '../../time'

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  test_drive_scheduled: 'Test drive scheduled',
  negotiation: 'Negotiation',
  converted: 'Converted',
  lost: 'Lost',
}

export const STATUS_OPTIONS = LEAD_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] }))

export const isClosed = (lead: Pick<Lead, 'status'>) => lead.status === 'converted' || lead.status === 'lost'

/** When the next follow-up is due, from the viewer's local date. Closed leads have none. */
export function followUpState(lead: Pick<Lead, 'status' | 'follow_up_on'>): 'overdue' | 'today' | 'later' | null {
  if (!lead.follow_up_on || isClosed(lead)) return null
  const today = localDate()
  if (lead.follow_up_on < today) return 'overdue'
  return lead.follow_up_on === today ? 'today' : 'later'
}
