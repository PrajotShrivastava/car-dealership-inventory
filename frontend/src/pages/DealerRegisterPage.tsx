import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { AuthLayout } from './AuthLayout'
import { validateEmail } from './validation'

interface Values {
  full_name: string
  email: string
  password: string
  business_name: string
  phone: string
  message: string
}

type Errors = Partial<Record<keyof Values, string>>

const STEPS = [
  'Submit your details below. You get a customer account straight away.',
  'An administrator reviews your application.',
  'Once approved, the same account can add, edit, restock and delete vehicles.',
]

export function DealerRegisterPage() {
  const { registerDealer } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Values>({
    full_name: '',
    email: '',
    password: '',
    business_name: '',
    phone: '',
    message: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const set = (key: keyof Values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors: Errors = {
      full_name: values.full_name.trim() ? undefined : 'Full name is required',
      email: validateEmail(values.email),
      password: values.password.length >= 8 ? undefined : 'Password must be at least 8 characters',
      business_name: values.business_name.trim() ? undefined : 'Dealership name is required',
      phone:
        !values.phone.trim() || /^[0-9+()\-.\s]{5,30}$/.test(values.phone.trim())
          ? undefined
          : 'Enter a valid phone number',
    }
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return

    setSubmitting(true)
    setFormError(null)
    try {
      await registerDealer({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
        business_name: values.business_name.trim(),
        phone: values.phone.trim() || undefined,
        message: values.message.trim() || undefined,
      })
      navigate('/app', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') setErrors({ email: error.message })
      else if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors)
      else setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Register as a dealer"
      subtitle="Apply for a dealer account to manage your dealership's inventory on DriveStock."
    >
      <ol className="mb-6 space-y-2 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        {STEPS.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-blue-300">
              {index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Full name" autoComplete="name" value={values.full_name} onChange={set('full_name')} error={errors.full_name} />
        <TextField label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set('password')}
          error={errors.password}
          hint="At least 8 characters"
        />
        <TextField
          label="Dealership name"
          autoComplete="organization"
          value={values.business_name}
          onChange={set('business_name')}
          error={errors.business_name}
        />
        <TextField label="Phone (optional)" type="tel" autoComplete="tel" value={values.phone} onChange={set('phone')} error={errors.phone} />
        <div className="space-y-1.5">
          <label htmlFor="dealer-message" className="block text-[13px] font-medium text-slate-700">
            Message for the reviewer (optional)
          </label>
          <textarea
            id="dealer-message"
            rows={3}
            maxLength={1000}
            value={values.message}
            onChange={set('message')}
            className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
            placeholder="e.g. location and size of your lot"
          />
        </div>
        <Button type="submit" loading={submitting} className="w-full">
          Submit application
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have a dealer account?{' '}
        <Link to="/login?as=dealer" className="font-medium text-brand-600 hover:text-brand-700 dark:text-blue-400 dark:hover:text-blue-300">
          Dealer Sign In
        </Link>
      </p>
    </AuthLayout>
  )
}
