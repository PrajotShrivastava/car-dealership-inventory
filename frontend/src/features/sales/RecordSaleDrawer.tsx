import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { leadsApi } from '../../api/leads'
import type { Sale } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Drawer } from '../../components/Drawer'
import { SelectField, TextField } from '../../components/Field'
import { localDate, viewerTimeZone } from '../../time'
import { formatPrice, vehicleTitle } from '../inventory/format'
import { EMAIL, MONEY, PHONE } from './format'
import { useMyVehicles, useRecordSale } from './queries'

/** What a sale can start from: a vehicle in the inventory, or a lead. */
export interface SaleStart {
  vehicleId?: number | null
  leadId?: number
  name?: string
  email?: string | null
  phone?: string | null
}

type Values = {
  vehicleId: string
  quantity: string
  /** null until the dealer edits it: the listing price is shown meanwhile. */
  unitPrice: string | null
  soldOn: string
  name: string
  email: string
  phone: string
  leadId: string
}
type Errors = Partial<Record<keyof Values, string>>

function validate(values: Values & { unitPrice: string }, inStock: number | undefined): Errors {
  const errors: Errors = {}
  if (!values.vehicleId) errors.vehicleId = 'Choose a vehicle'
  const quantity = Number(values.quantity)
  if (!/^\d+$/.test(values.quantity) || quantity < 1 || quantity > 10) errors.quantity = 'Sell 1 to 10 units at a time'
  else if (inStock !== undefined && quantity > inStock) errors.quantity = `Only ${inStock} in stock`
  if (!MONEY.test(values.unitPrice.trim()) || Number(values.unitPrice) <= 0) {
    errors.unitPrice = 'Enter a price greater than 0 (max 2 decimals)'
  }
  if (!values.soldOn) errors.soldOn = 'Enter the sale date'
  else if (values.soldOn > localDate()) errors.soldOn = 'The sale date can’t be in the future'
  else if (values.soldOn < '2000-01-01') errors.soldOn = 'Enter a date from 2000 onwards'
  if (!values.name.trim()) errors.name = 'Customer name is required'
  if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = 'Enter a valid email address'
  if (values.phone.trim() && !PHONE.test(values.phone.trim())) errors.phone = 'Enter a valid phone number'
  return errors
}

const FIELD_FOR: Record<string, keyof Values> = {
  vehicle_id: 'vehicleId',
  quantity: 'quantity',
  unit_price: 'unitPrice',
  sold_on: 'soldOn',
  customer_name: 'name',
  customer_email: 'email',
  customer_phone: 'phone',
}

export function RecordSaleDrawer({
  start,
  onClose,
  onRecorded,
}: {
  start?: SaleStart
  onClose: () => void
  onRecorded: (sale: Sale) => void
}) {
  const { data: vehicles } = useMyVehicles(true)
  const { data: leads } = useQuery({ queryKey: ['leads', 'picker'], queryFn: () => leadsApi.list({ limit: 100 }) })
  const record = useRecordSale()
  // One id per form: a retried or double submission records the sale only once.
  const [requestId] = useState(() => crypto.randomUUID())
  const [values, setValues] = useState<Values>({
    vehicleId: start?.vehicleId ? String(start.vehicleId) : '',
    quantity: '1',
    unitPrice: null,
    soldOn: localDate(),
    name: start?.name ?? '',
    email: start?.email ?? '',
    phone: start?.phone ?? '',
    leadId: start?.leadId ? String(start.leadId) : '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const vehicle = vehicles?.items.find((v) => String(v.id) === values.vehicleId)
  // The listing price, until the dealer types the agreed price.
  const unitPrice = values.unitPrice ?? (vehicle ? String(Number(vehicle.price)) : '')
  const quantity = Number(values.quantity) || 0
  const total = Number(unitPrice) * quantity
  const cost = vehicle?.acquisition_cost != null ? Number(vehicle.acquisition_cost) : null
  const profit = cost === null ? null : (Number(unitPrice) - cost) * quantity
  const openLeads = (leads?.items ?? []).filter((lead) => lead.sale_id === null && lead.status !== 'lost')

  const set = (key: keyof Values, value: string | null) => setValues((current) => ({ ...current, [key]: value }))

  function review(event: FormEvent) {
    event.preventDefault()
    const next = validate({ ...values, unitPrice }, vehicle?.quantity)
    setErrors(next)
    setFormError(null)
    if (!Object.keys(next).length) setConfirming(true)
  }

  function complete() {
    record.mutate(
      {
        vehicle_id: Number(values.vehicleId),
        quantity,
        unit_price: Number(unitPrice).toFixed(2),
        sold_on: values.soldOn,
        tz: viewerTimeZone(),
        customer_name: values.name.trim(),
        customer_email: values.email.trim() || null,
        customer_phone: values.phone.trim() || null,
        lead_id: values.leadId ? Number(values.leadId) : null,
        request_id: requestId,
      },
      {
        onSuccess: onRecorded,
        onError: (error) => {
          setConfirming(false)
          if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
            setErrors(
              Object.fromEntries(Object.entries(error.fieldErrors).map(([field, issue]) => [FIELD_FOR[field] ?? field, issue])),
            )
          }
          setFormError(error instanceof ApiError ? error.message : 'Could not record the sale. Please try again.')
        },
      },
    )
  }

  return (
    <Drawer title="Record sale" subtitle="Takes the units out of stock and adds the sale to your history." onClose={onClose}>
      <form noValidate onSubmit={review} className="space-y-5 px-6 py-5">
        {formError && <Alert>{formError}</Alert>}
        <SelectField
          label="Vehicle"
          value={values.vehicleId}
          onChange={(e) => {
            set('vehicleId', e.target.value)
            set('unitPrice', null)
          }}
          error={errors.vehicleId}
          options={[
            { value: '', label: vehicles?.items.length === 0 ? 'No vehicles in stock' : 'Select a vehicle' },
            ...(vehicles?.items ?? []).map((v) => ({
              value: String(v.id),
              label: `${vehicleTitle(v)}${v.trim ? ` ${v.trim}` : ''} (${v.year}) · ${v.quantity} in stock`,
            })),
          ]}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Quantity"
            type="number"
            min={1}
            max={Math.min(10, vehicle?.quantity ?? 10)}
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={errors.quantity}
          />
          <TextField
            label="Selling price per unit (USD)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={unitPrice}
            onChange={(e) => set('unitPrice', e.target.value)}
            error={errors.unitPrice}
            hint={vehicle ? `Listed at ${formatPrice(vehicle.price)}` : undefined}
          />
          <TextField
            label="Sale date"
            type="date"
            max={localDate()}
            value={values.soldOn}
            onChange={(e) => set('soldOn', e.target.value)}
            error={errors.soldOn}
          />
        </div>
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold text-slate-900">Customer</legend>
          <TextField label="Customer name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Customer email (optional)"
              type="email"
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              error={errors.email}
            />
            <TextField
              label="Customer phone (optional)"
              type="tel"
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              error={errors.phone}
            />
          </div>
          <SelectField
            label="Lead (optional)"
            value={values.leadId}
            onChange={(e) => set('leadId', e.target.value)}
            options={[
              { value: '', label: 'Not from a lead' },
              ...openLeads.map((lead) => ({ value: String(lead.id), label: lead.name })),
            ]}
          />
        </fieldset>

        {vehicle && quantity > 0 && Number(unitPrice) > 0 && (
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div>
              <dt className="text-slate-500">Revenue</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">{formatPrice(total)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Gross profit</dt>
              <dd className="font-semibold text-slate-900 tabular-nums">
                {profit === null ? (
                  <span className="text-xs font-normal text-slate-500">Profit unknown: no acquisition cost on this vehicle</span>
                ) : (
                  formatPrice(profit)
                )}
              </dd>
            </div>
          </dl>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={record.isPending}>
            Review sale
          </Button>
        </div>
      </form>

      {confirming && vehicle && (
        <ConfirmDialog
          title="Complete this sale?"
          confirmLabel="Complete sale"
          tone="primary"
          busy={record.isPending}
          onConfirm={complete}
          onCancel={() => setConfirming(false)}
        >
          <p>
            {quantity} × {[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')} to{' '}
            {values.name.trim()} for <strong>{formatPrice(total)}</strong>.
          </p>
          <p className="mt-2">This takes the units out of stock and can’t be undone here.</p>
        </ConfirmDialog>
      )}
    </Drawer>
  )
}
