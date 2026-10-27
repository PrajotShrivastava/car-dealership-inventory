import { useSyncExternalStore } from 'react'
import { APP_COMPARE } from '../../paths'

/** Vehicles picked for side-by-side comparison, kept per browser so they survive a reload. */
export const MAX_COMPARE = 3
const STORAGE_KEY = 'drivestock.compare'

function read(): number[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, MAX_COMPARE) : []
  } catch {
    return []
  }
}

let selection: number[] = read()
const listeners = new Set<() => void>()

function set(next: number[]) {
  selection = next.slice(0, MAX_COMPARE)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // Storage unavailable (private mode): the selection lasts for this tab only.
  }
  for (const listener of listeners) listener()
}

export const compareStore = {
  toggle(id: number) {
    if (selection.includes(id)) set(selection.filter((other) => other !== id))
    else if (selection.length < MAX_COMPARE) set([...selection, id])
  },
  remove(id: number) {
    set(selection.filter((other) => other !== id))
  },
  replace(ids: number[]) {
    set([...new Set(ids)])
  },
  clear() {
    set([])
  },
  /** Re-reads storage, e.g. between tests. */
  reload() {
    selection = read()
    for (const listener of listeners) listener()
  },
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCompareSelection(): number[] {
  return useSyncExternalStore(subscribe, () => selection)
}

/** "?ids=4,9,12" -> [4, 9, 12]: positive whole numbers, no repeats, at most MAX_COMPARE. */
export function parseIds(value: string | null): number[] {
  const ids = (value ?? '')
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
  return [...new Set(ids)].slice(0, MAX_COMPARE)
}

/** "/app/compare?ids=4,9" */
export function compareHref(ids: number[]): string {
  return `${APP_COMPARE}?ids=${ids.join(',')}`
}
