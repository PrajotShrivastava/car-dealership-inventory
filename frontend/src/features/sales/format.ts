import type { Sale } from '../../api/types'
import { formatPrice } from '../inventory/format'

/** Money, or a dash when the amount is unknown (e.g. profit without a recorded cost). */
export const moneyOrDash = (value: string | null) => (value === null ? '—' : formatPrice(value))

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })
export const formatSaleDate = (iso: string) => dateTime.format(new Date(iso))

export const channelLabel = (sale: Pick<Sale, 'channel'>) => (sale.channel === 'online' ? 'Online' : 'Recorded by you')

/** "From 3 of 5 sales with a recorded cost", when profit doesn't cover every sale. */
export function profitCoverage(withCost: number, total: number): string | undefined {
  if (total === 0) return undefined
  if (withCost === 0) return 'Add acquisition costs to vehicles to see profit'
  return withCost < total ? `From ${withCost} of ${total} sales with a recorded cost` : 'All sales have a recorded cost'
}

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE = /^\+?[0-9][0-9 ()\-.]{3,28}$/
export const MONEY = /^\d+(\.\d{1,2})?$/
