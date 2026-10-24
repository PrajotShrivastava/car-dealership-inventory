import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = {
      email: email.trim() ? undefined : 'Email is required',
      password: password ? undefined : 'Password is required',
    }
    setErrors(nextErrors)
    if (nextErrors.email || nextErrors.password) return

    setSubmitting(true)
    setFormError(null)
    try {
      await login(email.trim(), password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/', { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back. Sign in to browse and manage inventory.">
      <form noValidate onSubmit={handleSubmit} className="space-y-5">
        {formError && <Alert>{formError}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New to DriveStock?{' '}
        <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700 dark:text-blue-400 dark:hover:text-blue-300">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  )
}
