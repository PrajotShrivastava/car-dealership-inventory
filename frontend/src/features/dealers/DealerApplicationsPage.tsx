import { Check, Inbox, X } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import type { DealerApplication } from '../../api/types'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Spinner } from '../../components/Spinner'
import { usePendingApplications, useReviewApplication } from './queries'

type Decision = { application: DealerApplication; decision: 'approve' | 'reject' }

const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' })

function ApplicationCard({ application, onDecide }: { application: DealerApplication; onDecide: (d: Decision) => void }) {
  return (
    <li className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-semibold text-slate-900">{application.business_name}</h3>
        <p className="text-sm text-slate-700">
          {application.applicant.full_name} · <span>{application.applicant.email}</span>
        </p>
        {application.phone && <p className="text-sm text-slate-500">{application.phone}</p>}
        {application.message && (
          <p className="max-w-xl rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">{application.message}</p>
        )}
        <p className="text-xs text-slate-400">Applied {dateFormat.format(new Date(application.created_at))}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={<X aria-hidden className="size-3.5" />}
          onClick={() => onDecide({ application, decision: 'reject' })}
        >
          Reject
        </Button>
        <Button size="sm" icon={<Check aria-hidden className="size-3.5" />} onClick={() => onDecide({ application, decision: 'approve' })}>
          Approve
        </Button>
      </div>
    </li>
  )
}

export function DealerApplicationsPage() {
  const { data, isPending, isError, error } = usePendingApplications()
  const review = useReviewApplication()
  const [deciding, setDeciding] = useState<Decision | null>(null)
  const [note, setNote] = useState('')

  const close = () => {
    setDeciding(null)
    setNote('')
    review.reset()
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Dealer applications</h1>
        <p className="mt-1 text-sm text-canvas-muted">
          Approving an application gives that account admin access: adding, editing, restocking and deleting
          vehicles.
        </p>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 px-5 py-3 text-base font-semibold text-slate-900">
          Pending <span className="font-normal text-slate-500">({data?.length ?? 0})</span>
        </h2>
        {isPending ? (
          <div role="status" className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Spinner /> Loading applications…
          </div>
        ) : isError ? (
          <div className="p-5">
            <Alert>{error.message}</Alert>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center">
            <Inbox aria-hidden className="size-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-900">No pending applications</p>
            <p className="text-sm text-slate-500">New dealer registrations will appear here for review.</p>
          </div>
        ) : (
          <ul aria-label="Pending dealer applications" className="divide-y divide-slate-200">
            {data.map((application) => (
              <ApplicationCard key={application.id} application={application} onDecide={setDeciding} />
            ))}
          </ul>
        )}
      </section>

      {deciding && (
        <ConfirmDialog
          tone={deciding.decision === 'approve' ? 'primary' : 'danger'}
          title={`${deciding.decision === 'approve' ? 'Approve' : 'Reject'} ${deciding.application.business_name}?`}
          confirmLabel={deciding.decision === 'approve' ? 'Approve' : 'Reject'}
          busy={review.isPending}
          onCancel={close}
          onConfirm={() =>
            review.mutate(
              { id: deciding.application.id, decision: deciding.decision, note },
              { onSuccess: close },
            )
          }
        >
          {deciding.decision === 'approve' ? (
            <>
              {deciding.application.applicant.full_name} ({deciding.application.applicant.email}) will get admin
              access to manage inventory.
            </>
          ) : (
            <span className="block space-y-2">
              <span className="block">The account keeps customer access. You can add a note for the applicant.</span>
              <label className="block text-[13px] font-medium text-slate-700" htmlFor="review-note">
                Note (optional)
              </label>
              <textarea
                id="review-note"
                maxLength={500}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
              />
            </span>
          )}
          {review.isError && (
            <span className="mt-2 block text-red-600">
              {review.error instanceof ApiError ? review.error.message : 'Could not save the decision.'}
            </span>
          )}
        </ConfirmDialog>
      )}
    </div>
  )
}
