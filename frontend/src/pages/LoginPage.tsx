import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { cn } from '../components/cn'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import { postAuthTarget } from '../auth/redirects'
import { Alert } from '../components/Alert'
import { Button } from '../components/Button'
import { TextField } from '../components/Field'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  // Same secure sign-in for everyone; the account's role decides what appears after.
  const [params, setParams] = useSearchParams()
  const dealer = params.get('as') === 'dealer'
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
      navigate(postAuthTarget(location), { replace: true })
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Something went wrong. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={dealer ? 'Dealer sign in' : 'Sign in'}
      subtitle={
        dealer
          ? 'For dealership staff. Approved dealer accounts can manage vehicles, prices and stock.'
          : 'Welcome back. Sign in to browse the inventory and buy.'
      }
      above={
        <div role="tablist" aria-label="Account type" className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          {[
            { label: 'Customer', value: false },
            { label: 'Dealer Sign In', value: true },
          ].map((tab) => (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={dealer === tab.value}
              onClick={() => setParams(tab.value ? { as: 'dealer' } : {}, { replace: true, state: location.state })}
              className={cn(
                'h-9 rounded-md text-sm font-medium transition',
                dealer === tab.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      }
    >
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
      {dealer ? (
        <p className="mt-6 text-center text-sm text-slate-500">
          Want to sell on DriveStock?{' '}
          <Link to="/dealer/register" className="font-medium text-brand-600 hover:text-brand-700">
            Register as a Dealer
          </Link>
        </p>
      ) : (
        <p className="mt-6 text-center text-sm text-slate-500">
          New to DriveStock?{' '}
          <Link to="/signup" className="font-medium text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </p>
      )}
    </AuthLayout>
  )
}
