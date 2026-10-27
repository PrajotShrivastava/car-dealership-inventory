import { Minus, Plus, ShoppingCart } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../api/client'
import type { Purchase, Vehicle } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { APP_ACCOUNT } from '../../paths'
import { formatPrice } from './format'
import { usePurchase } from './queries'

const MAX_PER_ORDER = 10

export function PurchasePanel({ vehicle }: { vehicle: Vehicle }) {
  const purchase = usePurchase()
  const isCustomer = useAuth().user?.role === 'customer'
  const [quantity, setQuantity] = useState(1)
  const [confirmed, setConfirmed] = useState<Purchase | null>(null)

  const max = Math.min(vehicle.quantity, MAX_PER_ORDER)
  const qty = Math.max(1, Math.min(quantity, max))
  const soldOut = vehicle.quantity === 0

  const submit = () => {
    setConfirmed(null)
    purchase.mutate(
      { id: vehicle.id, quantity: qty },
      {
        onSuccess: (result) => {
          setConfirmed(result.purchase)
          setQuantity(1)
        },
      },
    )
  }

  return (
    <div className="space-y-3">
      {confirmed && (
        <Alert tone="success">
          Purchase confirmed: {confirmed.quantity} × {confirmed.vehicle_label} for {formatPrice(confirmed.total_price)}.{' '}
          {isCustomer && (
            <Link to={APP_ACCOUNT} className="font-medium underline">
              Get the invoice in My account
            </Link>
          )}
        </Alert>
      )}
      {purchase.isError && (
        <Alert>{purchase.error instanceof ApiError ? purchase.error.message : 'Purchase failed. Please try again.'}</Alert>
      )}
      <div className="flex flex-wrap items-center gap-4">
        {!soldOut && (
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-md border border-slate-300">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={qty <= 1}
                onClick={() => setQuantity(qty - 1)}
                className="flex size-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
              >
                <Minus className="size-4" />
              </button>
              <output aria-label="Quantity" aria-live="polite" className="w-8 text-center text-sm font-semibold tabular-nums">
                {qty}
              </output>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={qty >= max}
                onClick={() => setQuantity(qty + 1)}
                className="flex size-9 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:text-slate-300"
              >
                <Plus className="size-4" />
              </button>
            </div>
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-sm font-semibold text-slate-900 tabular-nums">{formatPrice(Number(vehicle.price) * qty)}</p>
            </div>
          </div>
        )}
        <Button
          className="ml-auto min-w-36"
          disabled={soldOut}
          loading={purchase.isPending}
          icon={<ShoppingCart aria-hidden className="size-4" />}
          onClick={submit}
        >
          {soldOut ? 'Out of stock' : 'Purchase'}
        </Button>
      </div>
    </div>
  )
}
