import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Lead, LeadFields, LeadStatus } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { Drawer } from '../../components/Drawer'
import { SelectField, TextAreaField, TextField } from '../../components/Field'
import { vehicleTitle } from '../inventory/format'
import { EMAIL, MONEY, PHONE } from '../sales/format'
import { useMyVehicles } from '../sales/queries'
import { useCreateLead, useUpdateLead } from './queries'
import { STATUS_OPTIONS } from './statusModel'

const SOURCES = ['Walk-in', 'Phone call', 'Website', 'Referral', 'Social media', 'Email', 'Other']

type Values = Record<'name' | 'email' | 'phone' | 'vehicleId' | 'budget' | 'source' | 'notes' | 'followUpOn', string> & {
  status: LeadStatus
}
type Errors = Partial<Record<keyof Values, string>>

function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = 'Name is required'
  else if (values.name.trim().length > 100) errors.name = 'Keep the name under 100 characters'
  if (values.email.trim() && !EMAIL.test(values.email.trim())) errors.email = 'Enter a valid email address'
  if (values.phone.trim() && !PHONE.test(values.phone.trim())) errors.phone = 'Enter a valid phone number'
  if (values.budget.trim() && (!MONEY.test(values.budget.trim()) || Number(values.budget) <= 0)) {
    errors.budget = 'Enter an amount greater than 0, or leave it blank'
  }
  if (values.source.trim().length > 50) errors.source = 'Keep the source under 50 characters'
  if (values.notes.length > 2000) errors.notes = 'Notes can be up to 2,000 characters'
  if (values.followUpOn && values.followUpOn < '2000-01-01') errors.followUpOn = 'Enter a date from 2000 onwards'
  return errors
}

function toFields(values: Values): LeadFields {
  return {
    name: values.name.trim(),
    email: values.email.trim() || null,
    phone: values.phone.trim() || null,
    vehicle_id: values.vehicleId ? Number(values.vehicleId) : null,
    budget: values.budget.trim() ? Number(values.budget).toFixed(2) : null,
    source: values.source.trim() || null,
    notes: values.notes.trim() || null,
    follow_up_on: values.followUpOn || null,
    status: values.status,
  }
}

const FIELD_FOR: Record<string, keyof Values> = { vehicle_id: 'vehicleId', follow_up_on: 'followUpOn' }

/** Create a lead, or edit one (`lead`). A lead with a recorded sale keeps its status. */
export function LeadFormDrawer({ lead, onClose, onSaved }: { lead?: Lead; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const { data: vehicles } = useMyVehicles()
  const create = useCreateLead()
  const update = useUpdateLead()
  const [values, setValues] = useState<Values>({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    vehicleId: lead?.vehicle_id ? String(lead.vehicle_id) : '',
    budget: lead?.budget ? String(Number(lead.budget)) : '',
    source: lead?.source ?? '',
    notes: lead?.notes ?? '',
    followUpOn: lead?.follow_up_on ?? '',
    status: lead?.status ?? 'new',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const pending = create.isPending || update.isPending
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((current) => ({ ...current, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    const next = validate(values)
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return
    const fields = toFields(values)
    try {
      const saved = lead
        ? await update.mutateAsync({
            id: lead.id,
            // A converted lead with a sale can't change status; don't send it.
            changes: lead.sale_id ? { ...fields, status: undefined } : fields,
          })
        : await create.mutateAsync(fields)
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(Object.fromEntries(Object.entries(error.fieldErrors).map(([f, issue]) => [FIELD_FOR[f] ?? f, issue])))
      }
      setFormError(error instanceof ApiError ? error.message : 'Could not save the lead. Please try again.')
    }
  }

  // The interested vehicle stays selectable even if it's sold out.
  const vehicleOptions = (vehicles?.items ?? []).map((v) => ({ value: String(v.id), label: `${vehicleTitle(v)} (${v.year})` }))
  if (lead?.vehicle_id && !vehicleOptions.some((o) => o.value === String(lead.vehicle_id))) {
    vehicleOptions.push({ value: String(lead.vehicle_id), label: lead.vehicle_label ?? 'Current vehicle' })
  }

  return (
    <Drawer title={lead ? 'Edit lead' : 'New lead'} subtitle={lead ? lead.name : 'Someone interested in buying.'} onClose={onClose}>
      <form noValidate onSubmit={submit} className="space-y-5 px-6 py-5">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Name" value={values.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Email (optional)" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} error={errors.email} />
          <TextField label="Phone (optional)" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} error={errors.phone} />
          <SelectField
            label="Interested vehicle (optional)"
            className="sm:col-span-2"
            value={values.vehicleId}
            onChange={(e) => set('vehicleId', e.target.value)}
            error={errors.vehicleId}
            options={[{ value: '', label: 'Not decided yet' }, ...vehicleOptions]}
          />
          <TextField
            label="Budget (optional, USD)"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={values.budget}
            onChange={(e) => set('budget', e.target.value)}
            error={errors.budget}
          />
          <TextField
            label="Source (optional)"
            list="lead-sources"
            value={values.source}
            onChange={(e) => set('source', e.target.value)}
            error={errors.source}
          />
          <datalist id="lead-sources">
            {SOURCES.map((source) => (
              <option key={source} value={source} />
            ))}
          </datalist>
          <TextField
            label="Next follow-up (optional)"
            type="date"
            min="2000-01-01"
            value={values.followUpOn}
            onChange={(e) => set('followUpOn', e.target.value)}
            error={errors.followUpOn}
          />
          <SelectField
            label="Lead status"
            value={values.status}
            disabled={Boolean(lead?.sale_id)}
            onChange={(e) => set('status', e.target.value as LeadStatus)}
            options={STATUS_OPTIONS}
          />
        </div>
        <TextAreaField label="Notes (optional)" value={values.notes} onChange={(e) => set('notes', e.target.value)} error={errors.notes} />
        <div className="flex justify-end">
          <Button type="submit" loading={pending}>
            {lead ? 'Save changes' : 'Create lead'}
          </Button>
        </div>
      </form>
    </Drawer>
  )
}
