import { Check, GitCompareArrows } from 'lucide-react'
import type { Vehicle } from '../../api/types'
import { Button } from '../../components/Button'
import { vehicleTitle } from '../inventory/format'
import { compareStore, MAX_COMPARE, useCompareSelection } from './compareStore'

export function CompareToggle({ vehicle }: { vehicle: Vehicle }) {
  const selection = useCompareSelection()
  const selected = selection.includes(vehicle.id)
  const full = !selected && selection.length >= MAX_COMPARE
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-pressed={selected}
      aria-label={`Compare ${vehicleTitle(vehicle)}`}
      title={full ? `You can compare up to ${MAX_COMPARE} vehicles` : undefined}
      disabled={full}
      icon={selected ? <Check aria-hidden className="size-3.5" /> : <GitCompareArrows aria-hidden className="size-3.5" />}
      onClick={() => compareStore.toggle(vehicle.id)}
      className={selected ? 'border-brand-500 text-brand-700' : undefined}
    >
      {selected ? 'Comparing' : 'Compare'}
    </Button>
  )
}
