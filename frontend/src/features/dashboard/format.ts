import type { DashboardVehicle } from '../../api/types'

/** "2026-10" -> "Oct 2026" (long) or "Oct" (short). Months are already in the viewer's zone. */
export function formatMonth(month: string, style: 'long' | 'short' = 'long'): string {
  const [year, index] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year!, index! - 1, 1))
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: style === 'long' ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).format(date)
}

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' })
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))
export const formatShortDate = (iso: string) => shortDate.format(new Date(iso))

export const formatCount = (value: number) => value.toLocaleString('en-US')

/** Percentage change, or null when there is nothing to compare with (never made up). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export function vehicleLabel(vehicle: Pick<DashboardVehicle, 'year' | 'make' | 'model' | 'trim'>): string {
  return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
}

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${formatCount(count)} ${count === 1 ? one : many}`
