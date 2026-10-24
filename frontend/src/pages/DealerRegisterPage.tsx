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
}

type Errors = Partial<Record<keyof Values, string>>

export function DealerRegisterPage() {
  const { registerDealer } = useAuth()
  const navigate = useNavigate()
  const [values, setValues] = useState<Values>({ full_name: '', email: '', password: '' })
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
      title="Create a dealer account"
      subtitle="For dealership staff. Add, edit and restock vehicles and upload photos as soon as you sign up."
    >
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
        <Button type="submit" loading={submitting} className="w-full">
          Create dealer account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have a dealer account?{' '}
        <Link to="/login?as=dealer" className="font-medium text-brand-600 hover:text-brand-700">
          Dealer Sign In
        </Link>
      </p>
    </AuthLayout>
  )
}
