import { useState } from 'react'
import { ArrowRight } from '@phosphor-icons/react'
import { Link, useNavigate } from '@tanstack/react-router'
import { PageHeader, Section, SECTION_ACTION } from '@/ui/PageHeader'
import { Panel } from '@/ui/Panel'
import { Input } from '@/ui/Input'
import { Button } from '@/ui/Button'
import { ProGate } from '@/components/pro-gate'
import { AnchorEditor } from '@/components/anchor-editor'
import { CalendarImport } from '@/components/calendar-import'
import { DayTimeline } from '@/components/day-timeline'
import { useGym } from '@/store/useGym'
import { useDayPlates } from '@/lib/use-day-plates'
import { useDayPlan } from '@/lib/use-day-plan'
import { todayIso } from '@/lib/dates'
import { formatLongDate } from '@/lib/labels'
import { formatMinutes, freeMinutes, MEAL_HOUR, type SlotKind } from '@/lib/day-plan'
import { SLEEP_DEFAULT, WAKE_DEFAULT } from '@/lib/life-profile'

/**
 * The day, arranged around the hours somebody does not control.
 *
 * Everything on this screen already existed somewhere else in the app: the
 * session comes from the planner, the plate from the recipe catalogue, the
 * challenge day from a challenge already running. This screen adds one fact
 * that was missing, which is *when*, and it computes that from the anchors
 * below rather than asking anybody to arrange it.
 *
 * The day is derived every time it is drawn and is not stored. It is a view of
 * the anchors and of the app's own content, so there is nothing to keep in step
 * and nothing to merge between two devices but the anchors themselves. Moving a
 * slot by hand would need the opposite of that and is not here yet.
 */

function UnplacedNote({ what }: { what: Exclude<SlotKind, 'anchor'> }) {
  const text =
    what === 'training'
      ? 'There is no gap long enough for the session today. Shorten the fixed hours, or train on another day.'
      : what === 'meal'
        ? 'No half hour free to eat, which is worth knowing rather than pretending otherwise.'
        : 'No quarter of an hour free for the challenge day today.'
  return <p className="text-sm text-ink-3">{text}</p>
}

function DayPlanner() {
  const navigate = useNavigate()
  const updateLifeProfile = useGym((s) => s.updateLifeProfile)
  const addAnchor = useGym((s) => s.addAnchor)
  const saveAnchor = useGym((s) => s.saveAnchor)
  const removeAnchor = useGym((s) => s.removeAnchor)
  const importBusy = useGym((s) => s.importBusy)
  const clearBusy = useGym((s) => s.clearBusy)

  const [date] = useState(todayIso())
  const plates = useDayPlates([date])
  const plate = plates[date]
  const { plan, profile } = useDayPlan(
    date,
    plate ? { label: plate.title, ref: plate.id } : null,
  )

  const free = freeMinutes(plan, profile)
  const hasAnything = plan.slots.length > 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Your day"
        description={formatLongDate(date)}
        hint={`${formatMinutes(free)} free`}
      />

      <Section
        title="Today, in order"
        hint={hasAnything ? undefined : 'nothing on it yet'}
      >
        {hasAnything ? (
          <div className="flex flex-col gap-3">
            <DayTimeline plan={plan} profile={profile} />
            {plan.unplaced.map((what) => (
              <UnplacedNote key={what} what={what} />
            ))}
          </div>
        ) : (
          <Panel padding="lg" className="flex flex-col items-start gap-3">
            <p className="max-w-[58ch] text-sm text-ink-3">
              Nothing to arrange yet. The day fills itself from what the rest of the app already
              knows: a week in the planner, a plate from the recipes, a challenge if one is
              running.
            </p>
            <Button variant="secondary" onClick={() => void navigate({ to: '/planner' })}>
              Open the planner
              <ArrowRight size={16} weight="bold" />
            </Button>
          </Panel>
        )}
      </Section>

      <Section title="When you are awake">
        <Panel padding="lg" className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Up at"
              type="time"
              value={profile.wake ?? WAKE_DEFAULT}
              onChange={(e) => updateLifeProfile({ wake: e.target.value })}
            />
            <Input
              label="In bed by"
              type="time"
              value={profile.sleep ?? SLEEP_DEFAULT}
              onChange={(e) => updateLifeProfile({ sleep: e.target.value })}
            />
          </div>
          <p className="max-w-[58ch] text-2xs text-ink-3">
            Nothing is placed outside these two. They start at {WAKE_DEFAULT} and{' '}
            {SLEEP_DEFAULT} because a day has to start somewhere, not because anybody thinks that
            is your day.
          </p>
        </Panel>
      </Section>

      <Section title="Hours you would rather">
        <Panel padding="lg" className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Train around"
              type="time"
              hint="Empty means wherever it fits best"
              value={profile.trainAt ?? ''}
              onChange={(e) => updateLifeProfile({ trainAt: e.target.value })}
            />
            <Input
              label="Main meal around"
              type="time"
              value={profile.mealAt ?? MEAL_HOUR}
              onChange={(e) => updateLifeProfile({ mealAt: e.target.value })}
            />
          </div>
          <p className="max-w-[58ch] text-2xs text-ink-3">
            Preferences, not rules. A session still goes where it fits: naming an hour decides
            where among the gaps that hold it, never whether.
          </p>
        </Panel>
      </Section>

      <Section
        title="Hours you do not choose"
        hint={`${profile.anchors.length}`}
        action={
          <Link to="/day/intake" className={SECTION_ACTION}>
            Describe it instead
          </Link>
        }
      >
        <AnchorEditor
          anchors={profile.anchors}
          onAdd={addAnchor}
          onSave={saveAnchor}
          onRemove={removeAnchor}
        />
      </Section>

      <Section title="From a calendar" hint={`${(profile.busy ?? []).length}`}>
        <CalendarImport
          busy={profile.busy ?? []}
          plan={plan}
          today={date}
          onImport={(blocks) => importBusy(blocks, date)}
          onClear={clearBusy}
        />
      </Section>
    </div>
  )
}

export function DayPage() {
  return (
    <ProGate feature="day-plan">
      <DayPlanner />
    </ProGate>
  )
}
