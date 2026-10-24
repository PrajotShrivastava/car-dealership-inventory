import { Clock, XCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useMyApplication } from './queries'

/** Tells applicants where their dealer application stands. Admins never see it. */
export function ApplicationBanner() {
  const { user, isAdmin } = useAuth()
  const { data: application } = useMyApplication(Boolean(user) && !isAdmin)
  if (!application || application.status === 'approved') return null

  const pending = application.status === 'pending'
  const Icon = pending ? Clock : XCircle
  return (
    <div
      role="status"
      aria-label="Dealer application"
      className={
        pending
          ? 'flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:px-6 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200'
          : 'flex items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:px-6 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-300'
      }
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      {pending ? (
        <p>
          <strong>Your dealer application for {application.business_name} is pending review.</strong> An
          administrator will approve or decline it. Until then you have customer access: you can browse and buy,
          but not manage inventory.
        </p>
      ) : (
        <p>
          <strong>Your dealer application for {application.business_name} was not approved.</strong>{' '}
          {application.review_note && <>Reviewer note: “{application.review_note}”. </>}You still have customer
          access.
        </p>
      )}
    </div>
  )
}
