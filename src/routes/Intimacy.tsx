import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { PageHeader, Section } from '@/ui/PageHeader'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Tag } from '@/ui/Tag'
import { EmptyState } from '@/ui/EmptyState'
import { ProGate } from '@/components/pro-gate'
import { IntimacyArt } from '@/components/intimacy-art'
import { intimacyState } from '@/lib/intimacy'
import {
  anyArt,
  excludedBy,
  isEmptyQuery,
  searchActivities,
  type ActivityQuery,
} from '@/lib/intimacy-search'
import {
  EFFORT_LABELS,
  EFFORT_METS,
  LIMITATION_LABELS,
  POSTURE_LABELS,
  type Effort,
  type Limitation,
  type Posture,
} from '@/data/intimacy'
import { cn } from '@/lib/utils'

/**
 * Intimate activity, treated as activity.
 *
 * The screen has one job and it is the search. A person with a bad lower back
 * or six months pregnant has the same question about this as about a deadlift
 * and nowhere sensible to ask it; the list of arrangements is the vehicle for
 * answering it. The other axes came later and are the same kind of question
 * asked physically rather than medically: what is light, what needs no
 * kneeling, what has two people facing each other.
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
 *
 * Illustrations are commissioned work that has not been commissioned, so the
 * cards carry an empty frame rather than a stand-in drawing. `IntimacyArt` says
 * why an empty frame beats no frame.
 *
 * The whole query is held in component state and not saved. It is a lens on a
 * list, it takes a few taps to set again, and saving it would mean storing
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
const ALL_EFFORTS: Effort[] = ['light', 'moderate', 'vigorous']
const ALL_POSTURES: Posture[] = ['lying', 'seated', 'kneeling', 'standing']

/** One filter chip. Pressed is a real `aria-pressed`, not a colour. */
function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'min-h-11 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
        on
          ? 'border-brand bg-brand text-brand-ink'
          : 'border-dashed border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}

function Filters({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-2xs font-medium text-ink-3">{title}</h3>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

function Module() {
  const navigate = useNavigate()
  const [query, setQuery] = useState<ActivityQuery>({})
  const shown = searchActivities(query)
  const hidden = excludedBy(query)
  const drawn = anyArt()

  const toggleIn = <T,>(list: readonly T[] | undefined, value: T): T[] => {
    const current = list ?? []
    return current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Time together"
        description="Arrangements, what each one asks of the body, and what it is unkind to. Nothing here is recorded."
      />

      <Section
        title="What are you after?"
        hint={hidden > 0 ? `${hidden} left out` : undefined}
        action={
          isEmptyQuery(query) ? undefined : (
            <Button variant="ghost" size="sm" onClick={() => setQuery({})}>
              Clear it
            </Button>
          )
        }
      >
        <Panel padding="lg" className="flex flex-col gap-5">
          <Input
            label="Search"
            type="search"
            placeholder="pillow, chair, forearms"
            value={query.text ?? ''}
            onChange={(e) => setQuery({ ...query, text: e.target.value })}
          />

          <Filters title="Working around">
            {ALL_LIMITATIONS.map((limitation) => (
              <Chip
                key={limitation}
                on={(query.limitations ?? []).includes(limitation)}
                onClick={() =>
                  setQuery({ ...query, limitations: toggleIn(query.limitations, limitation) })
                }
              >
                {LIMITATION_LABELS[limitation]}
              </Chip>
            ))}
          </Filters>

          <Filters title="Effort">
            {ALL_EFFORTS.map((effort) => (
              <Chip
                key={effort}
                on={(query.effort ?? []).includes(effort)}
                onClick={() => setQuery({ ...query, effort: toggleIn(query.effort, effort) })}
              >
                {EFFORT_LABELS[effort]}
              </Chip>
            ))}
          </Filters>

          <Filters title="Body">
            {ALL_POSTURES.map((posture) => (
              <Chip
                key={posture}
                on={(query.postures ?? []).includes(posture)}
                onClick={() => setQuery({ ...query, postures: toggleIn(query.postures, posture) })}
              >
                {POSTURE_LABELS[posture]}
              </Chip>
            ))}
            <Chip
              on={query.facing === true}
              onClick={() =>
                setQuery({ ...query, facing: query.facing === true ? undefined : true })
              }
            >
              Facing
            </Chip>
            <Chip
              on={query.facing === false}
              onClick={() =>
                setQuery({ ...query, facing: query.facing === false ? undefined : false })
              }
            >
              Not facing
            </Chip>
          </Filters>

          <p className="max-w-[62ch] text-2xs text-ink-3">
            None of this is saved. It filters the list on this screen and nothing else.
          </p>
        </Panel>
      </Section>

      <Section title="Arrangements" hint={`${shown.length}`}>
        {!drawn && (
          <p className="max-w-[62ch] text-2xs text-ink-3">
            The illustrations are being drawn. Until they arrive each card keeps the space for
            one rather than showing something approximate.
          </p>
        )}
        {shown.length === 0 ? (
          <EmptyState
            title="Nothing matches all of that"
            description="Try one thing at a time. Every limitation on its own still leaves something on the list."
            action={
              <Button variant="secondary" onClick={() => setQuery({})}>
                Clear it
              </Button>
            }
          />
        ) : (
          <Panel padding="none" className="divide-y divide-line">
            {shown.map((activity) => (
              <article key={activity.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row">
                <IntimacyArt activity={activity} />
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <h3 className="text-sm font-medium text-ink">{activity.name}</h3>
                    <Tag tone="outline">{EFFORT_LABELS[activity.effort]}</Tag>
                    <span className="num text-2xs text-ink-3">{EFFORT_METS[activity.effort]}</span>
                  </span>
                  <p className="max-w-[68ch] text-sm text-ink-2">{activity.description}</p>
                  {activity.note && (
                    <p className="max-w-[68ch] text-2xs text-ink-3">{activity.note}</p>
                  )}
                  <span className="flex flex-wrap items-center gap-1.5">
                    {activity.postures.map((posture) => (
                      <Tag key={posture} tone="neutral">
                        {POSTURE_LABELS[posture]}
                      </Tag>
                    ))}
                    <Tag tone="neutral">{activity.facing ? 'Facing' : 'Not facing'}</Tag>
                  </span>
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
                </div>
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
