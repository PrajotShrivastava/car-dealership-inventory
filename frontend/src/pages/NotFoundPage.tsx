import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="text-sm font-medium text-brand-600 hover:text-brand-700">
        Back to home
      </Link>
    </div>
  )
}
