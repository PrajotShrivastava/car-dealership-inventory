/** The viewer's IANA time zone, sent with date-based requests so "today" is their today. */
export function viewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** The viewer's local calendar date as "YYYY-MM-DD", offset by `days`. */
export function localDate(days = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toLocaleDateString('en-CA')
}

const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

/** "2026-10-27" -> "Oct 27, 2026", without shifting the calendar day across time zones. */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`))
}
