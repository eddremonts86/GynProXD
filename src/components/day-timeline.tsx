import { memo } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from '@tanstack/react-router'
import {
  Barbell,
  CalendarBlank,
  CalendarX,
  ForkKnife,
  Heart,
  Ticket,
  Trophy,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'
import {
  formatMinutes,
  freeGaps,
  lanesFor,
  type DayPlan,
  type DaySlot,
  type SlotKind,
} from '@/lib/day-plan'
import type { GapNote } from '@/lib/day-read'
import { clockOf, minutesOf, wakingWindow, type LifeProfile, type Span } from '@/lib/life-profile'
import { useNowMinutes } from '@/hooks/use-now-minutes'

/**
 * The day, drawn to scale.
 *
 * Hours are a ruler down the left; every block is positioned where its minutes
 * are and is as tall as it is long. Free time is the space between blocks,
 * which is what free time looks like, and only the gaps tall enough to carry a
 * label get one.
 *
 * The first version was a list with "2h free" rows between the items. It read
 * as a spreadsheet, and the annotation on the screenshot circled it. A block
 * you can see the height of is information a row of text is not.
 *
 * Two things at once sit side by side rather than on top of each other:
 * `lanesFor` works out the columns. The current minute is a hairline across
 * the track, moving on the half minute, with a dot that breathes. That dot is
 * the one perpetual animation on the screen and it is isolated in its own
 * memoised component so nothing else re-renders for it.
 */

/** Pixels per hour. Sixty-four puts a half-hour block at one legible line. */
export const HOUR_PX = 64
const PX_PER_MIN = HOUR_PX / 60
/** A gap shorter than this carries no label; the space still shows. */
const MIN_LABELLED_GAP_PX = 40
/** And shorter than this, no suggestion: two lines of text need the room. */
const MIN_NOTED_GAP_PX = 56
const SPRING = { type: 'spring', stiffness: 100, damping: 20 } as const

const ICONS: Record<SlotKind, Icon> = {
  anchor: CalendarBlank,
  busy: CalendarX,
  event: Ticket,
  training: Barbell,
  meal: ForkKnife,
  challenge: Trophy,
  intimacy: Heart,
}

/**
 * How each kind is painted. One signal: the session, which is what the rest of
 * the app is about, takes the strongest contrast. Everything imposed on the day
 * (anchors, calendar, events) is quiet; everything placed into it is a step up.
 */
const PAINT: Record<SlotKind, string> = {
  anchor: 'bg-surface-2 text-ink-2 ring-line',
  busy: 'bg-surface-2 text-ink-2 ring-line-strong [background-image:repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.04)_6px_7px)]',
  event: 'bg-surface text-ink ring-line',
  training: 'bg-brand text-brand-ink ring-transparent shadow-[var(--shadow-tile)]',
  meal: 'bg-surface text-ink ring-line',
  challenge: 'bg-surface text-ink ring-line',
  intimacy: 'bg-surface text-ink ring-line',
}

function hrefOf(
  slot: DaySlot,
):
  | { to: '/planner' | '/recipe/$id' | '/challenges' | '/inbox' | '/intimacy'; params?: { id: string } }
  | null {
  if (slot.kind === 'training') return { to: '/planner' }
  if (slot.kind === 'challenge') return { to: '/challenges' }
  if (slot.kind === 'meal' && slot.ref) return { to: '/recipe/$id', params: { id: slot.ref } }
  if (slot.kind === 'event') return { to: '/inbox' }
  if (slot.kind === 'intimacy') return { to: '/intimacy' }
  return null
}

interface Placed {
  slot: DaySlot
  top: number
  height: number
  lane: number
  lanes: number
}

function place(plan: DayPlan, window: Span): Placed[] {
  const lanes = lanesFor(plan.slots)
  const out: Placed[] = []
  plan.slots.forEach((slot, index) => {
    const start = minutesOf(slot.start)
    const end = minutesOf(slot.end)
    if (start === null || end === null || end <= start) return
    /* Clipped to the window for drawing, so a shift that starts before the
       alarm begins at the top of the track rather than above it. */
    const from = Math.max(start, window.start)
    const to = Math.min(end, window.end)
    if (to <= from) return
    out.push({
      slot,
      top: (from - window.start) * PX_PER_MIN,
      height: (to - from) * PX_PER_MIN,
      lane: lanes[index].lane,
      lanes: lanes[index].lanes,
    })
  })
  return out
}

/** The breathing dot on the now line. Isolated so its loop touches nothing else. */
const Pulse = memo(function Pulse({ still }: { still: boolean }) {
  return (
    <motion.span
      aria-hidden
      className="absolute -top-[4px] -left-[5px] size-2.5 rounded-full bg-danger"
      animate={still ? undefined : { scale: [1, 1.5, 1], opacity: [1, 0.55, 1] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  )
})

const NowLine = memo(function NowLine({ window, still }: { window: Span; still: boolean }) {
  const now = useNowMinutes()
  if (now < window.start || now >= window.end) return null
  const top = (now - window.start) * PX_PER_MIN
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10"
      style={{ top }}
      aria-label={`Now, ${clockOf(now)}`}
      role="img"
    >
      <div className="relative h-px bg-danger/70">
        <Pulse still={still} />
      </div>
    </div>
  )
})

function Block({ placed, index, still }: { placed: Placed; index: number; still: boolean }) {
  const { slot, top, height, lane, lanes } = placed
  const IconFor = ICONS[slot.kind]
  const compact = height < 44
  const tiny = height < 26
  const href = hrefOf(slot)

  const body = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <IconFor size={tiny ? 12 : 14} className="shrink-0 opacity-80" />
        <span className={cn('min-w-0 truncate font-medium', tiny ? 'text-2xs' : 'text-xs')}>
          {slot.label}
        </span>
      </span>
      {!compact && (
        <span className="num truncate text-2xs">{`${slot.start} to ${slot.end}`}</span>
      )}
    </>
  )

  const face = cn(
    'absolute inset-0 flex flex-col justify-between overflow-hidden rounded-md ring-1 ring-inset',
    'transition-[filter] duration-150 hover:brightness-[1.06] active:scale-[0.99]',
    /* A quarter-hour block keeps its text on one line; anything taller gets the
       full inset, because text against the edge of a box reads as an error. */
    tiny ? 'px-3 py-0.5' : 'px-3.5 py-2',
    PAINT[slot.kind],
  )
  const style = {
    top,
    height: Math.max(height, 18),
    left: `calc(${(lane / lanes) * 100}% + ${lane === 0 ? 0 : 2}px)`,
    width: `calc(${100 / lanes}% - ${lanes > 1 ? 2 : 0}px)`,
  }

  return (
    <motion.div
      layout
      initial={still ? false : { opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...SPRING, delay: still ? 0 : index * 0.035 }}
      className="absolute"
      style={style}
    >
      {href ? (
        <Link {...href} className={cn(face, 'text-inherit no-underline')}>
          {body}
        </Link>
      ) : (
        <div className={face}>{body}</div>
      )}
    </motion.div>
  )
}

export function DayTimeline({
  plan,
  profile,
  isToday,
  notes = [],
}: {
  plan: DayPlan
  profile: LifeProfile
  isToday: boolean
  /** What the model said each free gap allows, drawn inside the gap. */
  notes?: readonly GapNote[]
}) {
  const still = useReducedMotion() === true
  const window = wakingWindow(profile)
  const height = (window.end - window.start) * PX_PER_MIN
  const placed = place(plan, window)
  const free = freeGaps(plan, profile)

  const firstHour = Math.ceil(window.start / 60)
  const lastHour = Math.floor(window.end / 60)
  const hours: number[] = []
  for (let h = firstHour; h <= lastHour; h += 1) hours.push(h)

  return (
    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-3" aria-label="Today, to scale">
      {/* The ruler. Labels sit on the hour lines, not between them. */}
      <div className="relative" style={{ height }} aria-hidden>
        {hours.map((h) => (
          <span
            key={h}
            className="num absolute right-0 -translate-y-1/2 text-2xs text-ink-3"
            style={{ top: (h * 60 - window.start) * PX_PER_MIN }}
          >
            {clockOf(h * 60)}
          </span>
        ))}
      </div>

      {/* The track. */}
      <ul className="relative m-0 list-none p-0" style={{ height }}>
        {hours.map((h) => (
          <li
            key={`rule-${h}`}
            aria-hidden
            className="absolute inset-x-0 h-px bg-line"
            style={{ top: (h * 60 - window.start) * PX_PER_MIN }}
          />
        ))}

        {free.map((gap) => {
          const gapHeight = (gap.end - gap.start) * PX_PER_MIN
          if (gapHeight < MIN_LABELLED_GAP_PX) return null
          const middle = (gap.start - window.start) * PX_PER_MIN + gapHeight / 2
          const note = gapHeight >= MIN_NOTED_GAP_PX ? notes.find((n) => n.start === gap.start) : undefined
          return (
            <li key={`gap-${gap.start}`} className="contents">
              <span
                className="num pointer-events-none absolute right-4 -translate-y-1/2 text-2xs text-ink-3"
                style={{ top: middle }}
              >
                {formatMinutes(gap.end - gap.start)} free
              </span>
              {/* The suggestion sits in the space it is about. Left of the label,
                  two lines at most, and it arrives rather than appears. */}
              {note && (
                <motion.span
                  className="pointer-events-none absolute left-4 right-24 line-clamp-2 -translate-y-1/2 text-2xs leading-snug text-ink-2"
                  style={{ top: middle }}
                  initial={still ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={SPRING}
                >
                  {note.text}
                </motion.span>
              )}
            </li>
          )
        })}

        {placed.map((item, index) => (
          <li key={`${item.slot.kind}-${item.slot.start}-${item.slot.label}`} className="contents">
            <Block placed={item} index={index} still={still} />
          </li>
        ))}

        {/* An item too, so the track is a list of nothing but items. */}
        {isToday && (
          <li className="contents">
            <NowLine window={window} still={still} />
          </li>
        )}
      </ul>
    </div>
  )
}
