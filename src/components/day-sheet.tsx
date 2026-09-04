import { Link } from '@tanstack/react-router'
import { ArrowRight } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/ui/Input'
import { SECTION_ACTION } from '@/ui/PageHeader'
import { AnchorEditor } from '@/components/anchor-editor'
import { CalendarConnect } from '@/components/calendar-connect'
import { CalendarImport } from '@/components/calendar-import'
import type { CalendarLink } from '@/hooks/use-calendar-link'
import type { DayPlan } from '@/lib/day-plan'
import { MEAL_HOUR } from '@/lib/day-plan'
import {
  SLEEP_DEFAULT,
  WAKE_DEFAULT,
  type Anchor,
  type BusyBlock,
  type LifeProfile,
} from '@/lib/life-profile'

/**
 * Everything that shapes the day, off the day.
 *
 * The first `/day` was seventy percent forms: waking window, preferences,
 * anchors, a calendar picker, all stacked under a list. The screen is the day,
 * so the forms move here, into a sheet that slides in from the edge and lives
 * at `?edit` so the back button closes it. Same components, relocated; nothing
 * about how the inputs work changed.
 *
 * A dialog rather than a hand-rolled drawer, because the dialog already does
 * focus trapping, escape and the backdrop correctly and a drawer that does
 * those badly is worse than no drawer.
 */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  )
}

export function DaySheet({
  open,
  onClose,
  date,
  plan,
  profile,
  onProfile,
  onAddAnchor,
  onSaveAnchor,
  onRemoveAnchor,
  onImportBusy,
  onClearBusy,
  calendar,
}: {
  open: boolean
  onClose: () => void
  date: string
  plan: DayPlan
  profile: LifeProfile
  onProfile: (patch: Partial<Omit<LifeProfile, 'updatedAt'>>) => void
  onAddAnchor: (anchor: Omit<Anchor, 'id'>) => void
  onSaveAnchor: (anchor: Anchor) => void
  onRemoveAnchor: (id: string) => void
  onImportBusy: (blocks: readonly Omit<BusyBlock, 'id'>[]) => number
  onClearBusy: () => void
  calendar: CalendarLink
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className={
          /* A sheet, not a centred card: pinned to the right edge, full height,
             scrolling inside. The dialog's own fade still runs. */
          'top-0 right-0 left-auto h-dvh max-h-dvh w-full max-w-full translate-x-0 translate-y-0 ' +
          'rounded-none sm:max-w-md sm:rounded-l-xl overflow-y-auto gap-6 p-6 ' +
          'data-open:slide-in-from-right-4 data-closed:slide-out-to-right-4'
        }
      >
        <DialogHeader>
          <DialogTitle>Shape your day</DialogTitle>
          <DialogDescription>
            The hours you do not choose, when you are awake, and what you would rather. The day on
            the left follows as you type.
          </DialogDescription>
        </DialogHeader>

        <Group title="In your own words">
          <p className="text-sm text-ink-3">
            One paragraph about your week, read into fixed hours you keep or discard.
          </p>
          <Link to="/day/intake" className={SECTION_ACTION}>
            Describe your week
            <ArrowRight size={14} weight="bold" />
          </Link>
        </Group>

        <Group title="Awake">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Up at"
              type="time"
              value={profile.wake ?? WAKE_DEFAULT}
              onChange={(e) => onProfile({ wake: e.target.value })}
            />
            <Input
              label="In bed by"
              type="time"
              value={profile.sleep ?? SLEEP_DEFAULT}
              onChange={(e) => onProfile({ sleep: e.target.value })}
            />
          </div>
        </Group>

        <Group title="Would rather">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Train around"
              type="time"
              hint="Empty means wherever it fits"
              value={profile.trainAt ?? ''}
              onChange={(e) => onProfile({ trainAt: e.target.value })}
            />
            <Input
              label="Main meal around"
              type="time"
              value={profile.mealAt ?? MEAL_HOUR}
              onChange={(e) => onProfile({ mealAt: e.target.value })}
            />
          </div>
        </Group>

        <Group title="Hours you do not choose">
          <AnchorEditor
            anchors={profile.anchors}
            onAdd={onAddAnchor}
            onSave={onSaveAnchor}
            onRemove={onRemoveAnchor}
          />
        </Group>

        <Group title="Your calendar">
          <CalendarConnect link={calendar} />
        </Group>

        <Group title={calendar.offered ? 'Or a calendar file' : 'From a calendar'}>
          <CalendarImport
            busy={profile.busy ?? []}
            plan={plan}
            today={date}
            onImport={onImportBusy}
            onClear={onClearBusy}
          />
        </Group>
      </DialogContent>
    </Dialog>
  )
}
