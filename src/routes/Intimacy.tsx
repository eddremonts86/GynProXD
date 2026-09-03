import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { PageHeader, Section } from '@/ui/PageHeader'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { Tag } from '@/ui/Tag'
import { EmptyState } from '@/ui/EmptyState'
import { ProGate } from '@/components/pro-gate'
import { activitiesFor, excludedCount, intimacyState } from '@/lib/intimacy'
import {
  EFFORT_LABELS,
  EFFORT_METS,
  LIMITATION_LABELS,
  type Limitation,
} from '@/data/intimacy'
import { cn } from '@/lib/utils'

/**
 * Intimate activity, treated as activity.
 *
 * The screen has one job and it is the filter. A person with a bad lower back
 * or six months pregnant has the same question about this as about a deadlift
 * and nowhere sensible to ask it; the list of arrangements is the vehicle for
 * answering it.
 *
 * What is deliberately absent, and each absence is a decision:
 *
 *   no log        nothing is recorded. See `lib/intimacy.ts`: a record of
 *                 somebody's sexual activity is Article 9 data and the DPIA is
 *                 what governs holding it.
 *   no streak     a frequency target on somebody's sex life is a way to make
 *                 them feel worse, and this product's voice is factual rather
 *                 than motivational.
 *   no counts     nothing is totalled, so there is nothing to be behind on.
 *   no calories   the citation in `data/intimacy.ts` says why.
 *   no pictures   there is no freely licensed imagery for this and the
 *                 product's own rule forbids drawing something to stand in.
 *
 * The limitation choice is held in component state and not saved. It is a lens
 * on a list, it takes two taps to set again, and saving it would mean storing
 * "this person is working around their hips" next to the fact that they opted
 * into this module.
 */

const ALL_LIMITATIONS: Limitation[] = [
  'knees',
  'hips',
  'lower-back',
  'shoulders',
  'wrists',
  'neck',
  'pregnancy',
  'limited-mobility',
]

function Module() {
  const navigate = useNavigate()
  const [limitations, setLimitations] = useState<Limitation[]>([])
  const shown = activitiesFor(limitations)
  const hidden = excludedCount(limitations)

  const toggle = (limitation: Limitation) =>
    setLimitations((current) =>
      current.includes(limitation)
        ? current.filter((l) => l !== limitation)
        : [...current, limitation],
    )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Time together"
        description="Arrangements, what each one asks of the body, and what it is unkind to. Nothing here is recorded."
      />

      <Section title="Working around anything?" hint={hidden > 0 ? `${hidden} left out` : undefined}>
        <Panel padding="lg" className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {ALL_LIMITATIONS.map((limitation) => {
              const on = limitations.includes(limitation)
              return (
                <button
                  key={limitation}
                  type="button"
                  onClick={() => toggle(limitation)}
                  aria-pressed={on}
                  className={cn(
                    'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                    on
                      ? 'border-brand bg-brand text-brand-ink'
                      : 'border-dashed border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
                  )}
                >
                  {LIMITATION_LABELS[limitation]}
                </button>
              )
            })}
          </div>
          <p className="max-w-[62ch] text-2xs text-ink-3">
            This is not saved. It filters the list on this screen and nothing else.
          </p>
        </Panel>
      </Section>

      <Section title="Arrangements" hint={`${shown.length}`}>
        {shown.length === 0 ? (
          <EmptyState
            title="Nothing left with all of those"
            description="Try one at a time. Every single limitation on its own leaves something."
          />
        ) : (
          <Panel padding="none" className="divide-y divide-line">
            {shown.map((activity) => (
              <article key={activity.id} className="flex flex-col gap-2 p-4">
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="text-sm font-medium text-ink">{activity.name}</h3>
                  <Tag tone="outline">{EFFORT_LABELS[activity.effort]}</Tag>
                  <span className="num text-2xs text-ink-3">{EFFORT_METS[activity.effort]}</span>
                </span>
                <p className="max-w-[68ch] text-sm text-ink-2">{activity.description}</p>
                {activity.note && (
                  <p className="max-w-[68ch] text-2xs text-ink-3">{activity.note}</p>
                )}
                {activity.avoidWith.length > 0 && (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-2xs text-ink-3">Hard on</span>
                    {activity.avoidWith.map((l) => (
                      <Tag key={l} tone="neutral">
                        {LIMITATION_LABELS[l]}
                      </Tag>
                    ))}
                  </span>
                )}
              </article>
            ))}
          </Panel>
        )}
      </Section>

      <Panel padding="lg" tone="quiet" className="flex flex-col items-start gap-3">
        <p className="max-w-[62ch] text-sm text-ink-3">
          enForma gives structure, not medical advice. Anything to do with pain, a heart
          condition, a pregnancy or medication is a question for a clinician, and this module has
          no opinion about it.
        </p>
        <Button variant="ghost" onClick={() => void navigate({ to: '/settings' })}>
          Turn this off, or forget it
          <ArrowRight size={16} weight="bold" />
        </Button>
      </Panel>
    </div>
  )
}

function Gated() {
  const navigate = useNavigate()
  const state = intimacyState()
  if (!state.on || !state.affirmed) {
    /* Reachable by typing the URL, which is the only way to get here with the
       module off: the nav item and the day slot both disappear with it. */
    return (
      <EmptyState
        title="Switched off"
        description="This module is off on this device. Settings is where it is turned on, and where it is turned back off."
        action={
          <Button variant="secondary" onClick={() => void navigate({ to: '/settings' })}>
            Open Settings
          </Button>
        }
      />
    )
  }
  return <Module />
}

export function IntimacyPage() {
  return (
    <ProGate feature="intimacy">
      <Gated />
    </ProGate>
  )
}
