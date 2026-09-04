import { useState } from 'react'
import { ArrowRight, Check, X } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { PageHeader, Section } from '@/ui/PageHeader'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { Tag } from '@/ui/Tag'
import { Textarea } from '@/components/ui/textarea'
import { ProGate } from '@/components/pro-gate'
import { useGym } from '@/store/useGym'
import { alreadyThere, type ProposedAnchor } from '@/lib/anchor-parse'
import { proposeAnchors, where, type Proposals } from '@/lib/life-coach'
import { DAY_LABELS } from '@/store/useGym'
import { emptyLifeProfile } from '@/lib/life-profile'
import type { DayOfWeek } from '@/lib/types'

/**
 * Describe your week once, and check what was read out of it.
 *
 * The companion, and the shape of it is the point: nothing on this screen is
 * saved until somebody taps it. Every proposal carries where it came from and
 * which parts were worked out rather than quoted, because roughly half of what
 * either half of the parser produces is an inference and a member cannot check
 * a guess they were not shown.
 *
 * There is no question bank here and no questions about anybody's household.
 * See `docs/plans/2026-09-03-life-plan.md` for why the tiered bank the plan
 * described is not built: nothing reads those answers yet, and collecting
 * special-category data for a purpose that does not exist is the one thing
 * neither the ladder nor the regulation allows.
 */

const WEEK: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function daysLabel(days: readonly DayOfWeek[]): string {
  const ordered = WEEK.filter((d) => days.includes(d))
  if (ordered.length === 7) return 'Every day'
  if (ordered.length === 5 && !ordered.includes('sat') && !ordered.includes('sun')) return 'Weekdays'
  return ordered.map((d) => DAY_LABELS[d]).join(', ')
}

const PLACEHOLDER =
  'I work 09:00 to 17:00, the school run is at 08:15, and I get the train home 17:30 to 18:15.'

function ProposalRow({
  proposal,
  onAccept,
  onDismiss,
}: {
  proposal: ProposedAnchor
  onAccept: () => void
  onDismiss: () => void
}) {
  const guessed = [
    proposal.end_from === 'inferred' ? 'the end time' : null,
    proposal.days_from === 'inferred' ? 'the days' : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-ink">{proposal.label}</span>
          {guessed.length > 0 && <Tag tone="outline">Worked out: {guessed.join(' and ')}</Tag>}
        </span>
        <span className="num text-2xs text-ink-3">
          {proposal.start} to {proposal.end} · {daysLabel(proposal.days)}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="primary" size="sm" onClick={onAccept}>
          <Check size={16} weight="bold" />
          Keep
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Discard ${proposal.label}`}
          onClick={onDismiss}
        >
          <X size={16} />
        </Button>
      </div>
    </div>
  )
}

function Intake() {
  const navigate = useNavigate()
  const stored = useGym((s) => s.lifeProfile)
  const updateLifeProfile = useGym((s) => s.updateLifeProfile)
  const addAnchor = useGym((s) => s.addAnchor)
  const profile = stored ?? emptyLifeProfile()

  const [text, setText] = useState(profile.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Proposals | null>(null)
  const [kept, setKept] = useState(0)

  const destination = where()

  const read = async () => {
    if (busy || text.trim() === '') return
    setBusy(true)
    setKept(0)
    try {
      /* Their words are kept whether or not anything was read out of them: the
         prose is the only channel for what no field can hold, and the next
         phase to want it should not have to ask again. */
      updateLifeProfile({ notes: text })
      setResult(await proposeAnchors(text))
    } finally {
      setBusy(false)
    }
  }

  const accept = (proposal: ProposedAnchor) => {
    addAnchor({
      label: proposal.label,
      days: proposal.days,
      start: proposal.start,
      end: proposal.end,
      kind: proposal.kind,
    })
    setKept((n) => n + 1)
    dismiss(proposal)
  }

  const dismiss = (proposal: ProposedAnchor) => {
    setResult((current) =>
      current === null
        ? null
        : { ...current, anchors: current.anchors.filter((a) => a !== proposal) },
    )
  }

  const fresh = (result?.anchors ?? []).filter((a) => !alreadyThere(a, profile.anchors))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Describe your week"
        description="One paragraph. It reads the fixed hours out of it and you keep the ones it got right."
        action={
          <Button variant="ghost" onClick={() => void navigate({ to: '/day' })}>
            Your day
            <ArrowRight size={16} weight="bold" />
          </Button>
        }
      />

      <Section title="In your own words">
        <Panel padding="lg" className="flex flex-col gap-3">
          <Textarea
            aria-label="Describe your week"
            rows={5}
            placeholder={PLACEHOLDER}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {/**
           * The sentence before the box, not after it. `where()` is the same
           * answer the request itself uses, which is the whole reason
           * `coachDestination` exists in one place: these two came apart once
           * and the screen promised privacy the request did not keep.
           */}
          <p className="max-w-[62ch] text-2xs text-ink-3">
            {!destination.coach
              ? 'Read on this device. Nothing you type here is sent anywhere.'
              : destination.host === 'self'
                ? 'Read on this device first, then by a model running on our own hardware. It does not reach a third party.'
                : 'Read on this device first, then sent to our model provider to be read again. Write only what you are happy to send.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={() => void read()} disabled={busy || text.trim() === ''}>
              {busy ? 'Reading' : 'Read it'}
            </Button>
            {kept > 0 && (
              <span className="text-2xs text-ink-3">
                {kept === 1 ? '1 hour kept' : `${kept} hours kept`}
              </span>
            )}
          </div>
        </Panel>
      </Section>

      {result !== null && (
        <Section
          title="What it read"
          hint={result.source === 'coach' ? 'read by the coach' : 'read on this device'}
        >
          {fresh.length === 0 ? (
            <Panel padding="lg" className="flex flex-col items-start gap-3">
              <p className="max-w-[58ch] text-sm text-ink-3">
                {(result.anchors ?? []).length > 0
                  ? 'Everything it found is already on your day.'
                  : 'No fixed hours in that. Times help: "work 09:00 to 17:00" reads better than "work all day".'}
              </p>
              <Button variant="secondary" onClick={() => void navigate({ to: '/day' })}>
                Open your day
                <ArrowRight size={16} weight="bold" />
              </Button>
            </Panel>
          ) : (
            <div className="flex flex-col gap-3">
              <Panel padding="none" className="divide-y divide-line">
                {fresh.map((proposal, index) => (
                  <ProposalRow
                    key={`${proposal.label}-${proposal.start}-${index}`}
                    proposal={proposal}
                    onAccept={() => accept(proposal)}
                    onDismiss={() => dismiss(proposal)}
                  />
                ))}
              </Panel>
              <p className="max-w-[62ch] text-2xs text-ink-3">
                Nothing here is saved until you keep it. Anything marked "worked out" was not in
                your words: check it before you do.
              </p>
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

export function DayIntakePage() {
  return (
    <ProGate feature="companion">
      <Intake />
    </ProGate>
  )
}
