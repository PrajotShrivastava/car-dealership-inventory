import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { CATEGORIES, FUEL_TYPES, TRANSMISSIONS, type Vehicle, type VehicleFields } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { SelectField, TextField } from '../../components/Field'
import { titleCase } from '../inventory/format'
import { initialValues, MAX_YEAR, toFields, validate, type VehicleFormErrors, type VehicleFormValues } from './vehicleFormModel'

const options = (values: readonly string[]) => values.map((value) => ({ value, label: titleCase(value) }))

interface VehicleFormProps {
  vehicle?: Vehicle
  withQuantity?: boolean
  submitLabel: string
  onSubmit: (fields: VehicleFields, quantity: number) => Promise<unknown>
  successMessage?: string
}

export function VehicleForm({ vehicle, withQuantity = false, submitLabel, onSubmit, successMessage }: VehicleFormProps) {
  const [values, setValues] = useState<VehicleFormValues>(() => initialValues(vehicle))
  const [errors, setErrors] = useState<VehicleFormErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const set = <K extends keyof VehicleFormValues>(key: K, value: VehicleFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = validate(values, { withQuantity })
    setErrors(nextErrors)
    setFormError(null)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    try {
      await onSubmit(toFields(values), Number(values.quantity))
      setSaved(true)
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(error.fieldErrors as VehicleFormErrors)
      } else {
        setFormError(error instanceof ApiError ? error.message : 'Could not save. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-5 px-6 py-5">
      {formError && <Alert>{formError}</Alert>}
      {saved && successMessage && <Alert tone="success">{successMessage}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Make" value={values.make} onChange={(e) => set('make', e.target.value)} error={errors.make} />
        <TextField label="Model" value={values.model} onChange={(e) => set('model', e.target.value)} error={errors.model} />
        <TextField
          label="Trim (optional)"
          value={values.trim}
          onChange={(e) => set('trim', e.target.value)}
          error={errors.trim}
        />
        <TextField
          label="Year"
          type="number"
          min={1900}
          max={MAX_YEAR}
          value={values.year}
          onChange={(e) => set('year', e.target.value)}
          error={errors.year}
        />
        <SelectField
          label="Category"
          value={values.category}
          onChange={(e) => set('category', e.target.value as VehicleFormValues['category'])}
          options={options(CATEGORIES)}
          error={errors.category}
        />
        <SelectField
          label="Fuel type"
          value={values.fuel_type}
          onChange={(e) => set('fuel_type', e.target.value as VehicleFormValues['fuel_type'])}
          options={options(FUEL_TYPES)}
          error={errors.fuel_type}
        />
        <SelectField
          label="Transmission"
          value={values.transmission}
          onChange={(e) => set('transmission', e.target.value as VehicleFormValues['transmission'])}
          options={options(TRANSMISSIONS)}
          error={errors.transmission}
        />
        <TextField
          label="Price (USD)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={values.price}
          onChange={(e) => set('price', e.target.value)}
          error={errors.price}
        />
        {withQuantity && (
          <TextField
            label="Initial stock"
            type="number"
            min={0}
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
            error={errors.quantity}
            hint="Later changes go through Restock or purchases."
          />
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
