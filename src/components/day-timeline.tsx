import { Barbell, CalendarBlank, ForkKnife, Trophy } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link } from '@tanstack/react-router'
import { Panel } from '@/ui/Panel'
import { formatMinutes, type DayPlan, type DaySlot, type SlotKind } from '@/lib/day-plan'
import { clockOf, minutesOf, wakingWindow, type LifeProfile } from '@/lib/life-profile'

/**
 * The day, read top to bottom.
 *
 * A list with the free time called out between the rows, not a proportional
 * strip. Proportional was the first idea and it is wrong on a phone: an eight
 * hour work block drawn to scale reduces a ninety minute session to a sliver
 * and the plate to a line, so the two things somebody opened the screen for are
 * the two hardest to read. Here every row is legible and the gaps carry a
 * number, which is the same information without the scale problem.
 *
 * The gaps are computed from the slots rather than emitted by `buildDay`,
 * because free time is not an activity and the planner does not invent one. It
 * is the space between things, and space is a rendering concern.
 */

const ICONS: Record<SlotKind, Icon> = {
  anchor: CalendarBlank,
  training: Barbell,
  meal: ForkKnife,
  challenge: Trophy,
}

const TONE: Record<SlotKind, string> = {
  anchor: 'text-ink-3',
  training: 'text-brand',
  meal: 'text-ink-2',
  challenge: 'text-ink-2',
}

/** Where a slot links to, when it points at something with a screen of its own. */
function hrefOf(slot: DaySlot): { to: '/planner' | '/recipe/$id' | '/challenges'; params?: { id: string } } | null {
  if (slot.kind === 'training') return { to: '/planner' }
  if (slot.kind === 'challenge') return { to: '/challenges' }
  if (slot.kind === 'meal' && slot.ref) return { to: '/recipe/$id', params: { id: slot.ref } }
  return null
}

function Row({ slot }: { slot: DaySlot }) {
  const IconFor = ICONS[slot.kind]
  const body = (
    <>
      <span className="num w-[5.5rem] shrink-0 text-2xs text-ink-3">
        {slot.start}
        <span className="px-1 text-ink-3">to</span>
        {slot.end}
      </span>
      <IconFor size={16} className={TONE[slot.kind]} />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{slot.label}</span>
    </>
  )
  const href = hrefOf(slot)
  return href ? (
    <Link
      {...href}
      className="flex min-h-11 items-center gap-2 px-3 py-2 hover:bg-surface-2"
    >
      {body}
    </Link>
  ) : (
    <div className="flex min-h-11 items-center gap-2 px-3 py-2">{body}</div>
  )
}

function Gap({ from, to }: { from: number; to: number }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="num w-[5.5rem] shrink-0 text-2xs text-ink-3">{clockOf(from)}</span>
      <span className="h-px flex-1 border-t border-dashed border-line" />
      <span className="num text-2xs text-ink-3">{formatMinutes(to - from)} free</span>
    </div>
  )
}

export function DayTimeline({ plan, profile }: { plan: DayPlan; profile: LifeProfile }) {
  const window = wakingWindow(profile)
  const rows: React.ReactNode[] = []
  /* Where the drawing has got to. Not the same as the previous slot's end: an
     anchor is drawn as entered and may overhang the window or a neighbour, and
     a gap computed from an overhang would be negative. */
  let cursor = window.start

  plan.slots.forEach((slot, index) => {
    const start = minutesOf(slot.start)
    const end = minutesOf(slot.end)
    if (start === null || end === null) return
    if (start > cursor) rows.push(<Gap key={`gap-${index}`} from={cursor} to={start} />)
    rows.push(<Row key={`${slot.kind}-${slot.start}-${index}`} slot={slot} />)
    cursor = Math.max(cursor, end)
  })
  if (cursor < window.end) rows.push(<Gap key="gap-last" from={cursor} to={window.end} />)

  return (
    <Panel padding="none" className="divide-y divide-line">
      {rows}
    </Panel>
  )
}
