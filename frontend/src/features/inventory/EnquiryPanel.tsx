import { CalendarDays, MessageSquare } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import type { EnquiryKind, Vehicle } from '../../api/types'
import { useAuth } from '../../auth/AuthContext'
import { Alert } from '../../components/Alert'
import { Button } from '../../components/Button'
import { TextAreaField, TextField } from '../../components/Field'
import { formatDay, localDate, viewerTimeZone } from '../../time'
import { useEnquire } from './queries'

type Errors = Partial<Record<'message' | 'phone' | 'preferred_date', string>>

const SENT: Record<EnquiryKind, string> = {
  question: 'Question sent.',
  test_drive: 'Test drive requested.',
}

/** Lets a customer ask the listing dealer a question or request a test drive; it reaches them as a lead. */
export function EnquiryPanel({ vehicle }: { vehicle: Vehicle }) {
  const { user } = useAuth()
  const enquire = useEnquire(vehicle.id)
  const [kind, setKind] = useState<EnquiryKind | null>(null)
  const [message, setMessage] = useState('')
  const [phone, setPhone] = useState('')
  const [preferredDate, setPreferredDate] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ kind: EnquiryKind; date?: string } | null>(null)

  const open = (next: EnquiryKind) => {
    setKind(next)
    setErrors({})
    setFormError(null)
    setSent(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!kind) return
    const next: Errors = {}
    if (kind === 'question' && !message.trim()) next.message = 'Write your question'
    if (kind === 'test_drive' && !preferredDate) next.preferred_date = 'Choose a date'
    else if (kind === 'test_drive' && preferredDate < localDate()) next.preferred_date = "The date can't be in the past"
    setErrors(next)
    setFormError(null)
    if (Object.keys(next).length) return

    try {
      await enquire.mutateAsync({
        kind,
        message: message.trim() || undefined,
        phone: phone.trim() || undefined,
        preferred_date: kind === 'test_drive' ? preferredDate : undefined,
        tz: viewerTimeZone(),
      })
      setSent({ kind, date: kind === 'test_drive' ? preferredDate : undefined })
      setKind(null)
      setMessage('')
      setPreferredDate('')
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) setErrors(error.fieldErrors)
      setFormError(error instanceof ApiError ? error.message : 'Could not send. Please try again.')
    }
  }

  return (
    <section aria-labelledby="enquiry-heading" className="space-y-3">
      <div>
        <h3 id="enquiry-heading" className="text-sm font-semibold text-slate-900">
          Talk to the dealer
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">They'll reply to {user?.email ?? 'your email'}.</p>
      </div>

      {sent && (
        <Alert tone="success">
          {SENT[sent.kind]}{' '}
          {sent.date ? `The dealer will confirm ${formatDay(sent.date)} with you.` : 'The dealer will be in touch soon.'}
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Contact the dealer">
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={kind === 'question'}
          icon={<MessageSquare aria-hidden className="size-3.5" />}
          onClick={() => open('question')}
          className={kind === 'question' ? 'border-brand-500 text-brand-700' : undefined}
        >
          Ask a question
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-pressed={kind === 'test_drive'}
          icon={<CalendarDays aria-hidden className="size-3.5" />}
          onClick={() => open('test_drive')}
          className={kind === 'test_drive' ? 'border-brand-500 text-brand-700' : undefined}
        >
          Book a test drive
        </Button>
      </div>

      {kind && (
        <form
          noValidate
          onSubmit={submit}
          aria-label={kind === 'question' ? 'Ask a question' : 'Book a test drive'}
          className="space-y-4 rounded-lg border border-slate-200 p-4"
        >
          {formError && <Alert>{formError}</Alert>}
          {kind === 'test_drive' && (
            <TextField
              label="Preferred date"
              type="date"
              min={localDate()}
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              error={errors.preferred_date}
            />
          )}
          <TextAreaField
            label={kind === 'question' ? 'Your question' : 'Anything the dealer should know? (optional)'}
            maxLength={2000}
            placeholder={kind === 'question' ? 'Is the service history available?' : 'Mornings work best for me.'}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            error={errors.message}
          />
          <TextField
            label="Phone (optional)"
            type="tel"
            autoComplete="tel"
            hint="If you'd rather they call."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setKind(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={enquire.isPending}>
              {kind === 'question' ? 'Send question' : 'Request test drive'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
