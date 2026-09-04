import { ArrowRight, SlidersHorizontal } from '@phosphor-icons/react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { PageHeader } from '@/ui/PageHeader'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { ProGate } from '@/components/pro-gate'
import { DayNowTile } from '@/components/day-now-tile'
import { DaySwitcher } from '@/components/day-switcher'
import { DayReadPanel } from '@/components/day-read'
import { DaySheet } from '@/components/day-sheet'
import { DayTimeline } from '@/components/day-timeline'
import { NearbyEvents } from '@/components/nearby-events'
import { useCalendarLink } from '@/hooks/use-calendar-link'
import { useDayRead } from '@/hooks/use-day-read'
import { useNearbyEvents } from '@/hooks/use-nearby-events'
import { outingFrom, withOuting, type NearbyEvent } from '@/lib/nearby-events'
import { useGym } from '@/store/useGym'
import { useDayPlates } from '@/lib/use-day-plates'
import { useDayPlan } from '@/lib/use-day-plan'
import { todayIso } from '@/lib/dates'
import { clampDay } from '@/lib/day-window'
import { formatMinutes, freeMinutes, type PlacedKind } from '@/lib/day-plan'

/**
 * The day, drawn to scale, with nothing else on the screen.
 *
 * Two columns on a wide screen and the wider one is the day: a proportional
 * timeline where a block is as tall as it is long and free time is visible
 * space. Beside it, the one hero figure this screen has — how long until the
 * next thing changes — and the honest lines about what did not fit. Every form
 * that shapes the day lives in a sheet at `?edit`, so the back button closes
 * it and the main view has one job.
 *
 * The day is still derived every time it is drawn. The redesign changed what
 * it looks like, not what it is.
 *
 * Which day is `?d`, defaulting to today and clamped to the three weeks a
 * calendar import reads. The screen drew today and only today until the rest of
 * this phase gave it things to say about other days: a connected calendar reads
 * three weeks ahead and an outing added from the events strip is usually next
 * Friday. Both were being stored where nobody could look at them.
 *
 * **Everything that prunes by date prunes by the real today**, never by the day
 * on screen. Reading Friday must not delete Thursday's blocks, and passing the
 * viewed date into `importBusy` or `withOuting` would do exactly that.
 */

/* Worded without "today", because this screen draws other days now. */
const NOTES: Record<PlacedKind, string> = {
  training:
    'No gap long enough for the session. Shorten the fixed hours, or train on another day.',
  meal: 'No half hour free to eat, which is worth knowing rather than pretending otherwise.',
  challenge: 'No quarter of an hour free for the challenge day.',
  intimacy: 'No half hour left over.',
}

function DayPlanner() {
  const navigate = useNavigate()
  const { edit, calendar: cameBack, d } = useSearch({ from: '/day' })
  const updateLifeProfile = useGym((s) => s.updateLifeProfile)
  const addAnchor = useGym((s) => s.addAnchor)
  const saveAnchor = useGym((s) => s.saveAnchor)
  const removeAnchor = useGym((s) => s.removeAnchor)
  const importBusy = useGym((s) => s.importBusy)
  const syncCalendarBusy = useGym((s) => s.syncCalendarBusy)
  const clearBusy = useGym((s) => s.clearBusy)

  const today = todayIso()
  const date = clampDay(d, today)
  const isToday = date === today
  const plates = useDayPlates([date])
  const plate = plates[date]
  const { plan, profile } = useDayPlan(date, plate ? { label: plate.title, ref: plate.id } : null)

  const free = freeMinutes(plan, profile)
  const hasAnything = plan.slots.length > 0
  /* The sheet opens by itself when somebody lands back from Google, because
     that is where the connection they just made is, and an unexplained return
     to a day that has changed is worse than a drawer. */
  const calendar = useCalendarLink(
    (blocks, source) => syncCalendarBusy(blocks, today, source),
    cameBack === 'connected',
  )
  const nearby = useNearbyEvents(profile, updateLifeProfile)
  const nearbyThisDay =
    nearby.state.kind === 'done' ? nearby.state.events.filter((e) => e.date === date) : []
  const reading = useDayRead(plan, profile, nearbyThisDay)
  const notes = reading.state.kind === 'done' ? reading.state.read.notes : []
  const addOuting = (event: NearbyEvent) => {
    const outing = outingFrom(event)
    if (outing) updateLifeProfile({ outings: withOuting(profile.outings ?? [], outing, today) })
  }
  const removeOuting = (id: string) =>
    updateLifeProfile({ outings: (profile.outings ?? []).filter((o) => o.id !== id) })
  /* The day travels with every navigation on this screen, so opening the sheet
     or coming back from it does not quietly return somebody to today. */
  const search = isToday ? {} : { d: date }
  const openSheet = () => void navigate({ to: '/day', search: { ...search, edit: true } })
  const backFromGoogle = typeof cameBack === 'string'
  const closeSheet = () => void navigate({ to: '/day', search })
  const goToDay = (next: string) =>
    void navigate({ to: '/day', search: next === today ? {} : { d: next } })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Your day"
        hint={`${formatMinutes(free)} free`}
        action={
          <>
            <DaySwitcher date={date} today={today} onDate={goToDay} />
            <Button variant="secondary" onClick={openSheet}>
              <SlidersHorizontal size={16} />
              Shape my day
            </Button>
          </>
        }
      />

      {/* Asymmetric on purpose: the day takes two thirds, the figure one. On a
          phone the figure comes first, because it is the sentence somebody
          opened the screen for, and the track scrolls under it. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:items-start">
        <aside className="order-first flex flex-col gap-4 md:order-last md:sticky md:top-6">
          <DayNowTile plan={plan} profile={profile} isToday={isToday} freeMinutesTotal={free} />

          {/* Asked for, never automatic: the day carries what somebody typed,
              and reading it spends a metered call. An empty day has nothing
              to read. */}
          {hasAnything && (
            <DayReadPanel
              state={reading.state}
              offered={reading.offered}
              host={reading.host}
              onAsk={() => void reading.ask()}
            />
          )}

          {plan.unplaced.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-line pt-4">
              {plan.unplaced.map((what) => (
                <li key={what} className="text-sm text-ink-3">
                  {NOTES[what]}
                </li>
              ))}
            </ul>
          )}

          {!hasAnything && (
            <EmptyState
              title="Nothing on it yet"
              description="The day fills itself from what the rest of the app already knows. Tell it the hours you do not choose and the rest falls into place."
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="primary" onClick={() => void navigate({ to: '/day/intake' })}>
                    Describe your week
                    <ArrowRight size={16} weight="bold" />
                  </Button>
                  <Button variant="ghost" onClick={openSheet}>
                    Add fixed hours
                  </Button>
                </div>
              }
            />
          )}
        </aside>

        <div className="min-w-0">
          <DayTimeline plan={plan} profile={profile} isToday={isToday} notes={notes} />
        </div>
      </div>

      {/* Under the day, full width: what is on near them, and a tap puts one on
          the day above as an outing. Absent on a server with no source. */}
      <NearbyEvents
        state={nearby.state}
        place={nearby.place}
        offered={nearby.offered}
        outings={profile.outings ?? []}
        onLocate={nearby.locate}
        onCity={nearby.lookAround}
        onForget={nearby.forget}
        onRetry={nearby.retry}
        onAdd={addOuting}
        onRemove={removeOuting}
      />

      <DaySheet
        open={edit === true || backFromGoogle}
        onClose={closeSheet}
        date={date}
        plan={plan}
        profile={profile}
        onProfile={updateLifeProfile}
        onAddAnchor={addAnchor}
        onSaveAnchor={saveAnchor}
        onRemoveAnchor={removeAnchor}
        onImportBusy={(blocks) => importBusy(blocks, today)}
        onClearBusy={clearBusy}
        calendar={calendar}
      />
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
