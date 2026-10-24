import { PackagePlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Vehicle } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { TextField } from '../../components/Field'
import { StockBadge } from '../inventory/StockBadge'
import { useRestock } from '../inventory/queries'

export function RestockForm({ vehicle }: { vehicle: Vehicle }) {
  const restock = useRestock(vehicle.id)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string>()
  const [added, setAdded] = useState<number | null>(null)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const quantity = Number(amount)
    if (!/^\d+$/.test(amount) || quantity < 1 || quantity > 1000) {
      setError('Enter a whole number between 1 and 1000')
      return
    }
    setError(undefined)
    setAdded(null)
    restock.mutate(quantity, {
      onSuccess: () => {
        setAdded(quantity)
        setAmount('')
      },
    })
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3">
        <span className="text-sm text-slate-600">Current stock</span>
        <StockBadge quantity={vehicle.quantity} />
      </div>
      {added !== null && (
        <Alert tone="success">
          Added {added} units. Now {vehicle.quantity} in stock.
        </Alert>
      )}
      {restock.isError && (
        <Alert>{restock.error instanceof ApiError ? restock.error.message : 'Restock failed. Please try again.'}</Alert>
      )}
      <TextField
        label="Units to add"
        type="number"
        min={1}
        max={1000}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        error={error}
        hint="Between 1 and 1000 per restock."
      />
      <div className="flex justify-end">
        <Button type="submit" loading={restock.isPending} icon={<PackagePlus aria-hidden className="size-4" />}>
          Restock
        </Button>
      </div>
    </form>
  )
}
