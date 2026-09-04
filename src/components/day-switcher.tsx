import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { IconButton, Button } from '@/ui/Button'
import { formatLongDate } from '@/lib/labels'
import { relativeDayLabel, stepDay } from '@/lib/day-window'

/**
 * Which day is on screen, and the two steps either side of it.
 *
 * An arrow with nowhere to go is disabled rather than hidden: the window has
 * two ends and somebody walking towards one should be able to see it coming.
 * "Today" appears only when it would do something, which is the same rule the
 * sheet's "Clear it" follows.
 *
 * The date itself is the label, with "Today" or "Tomorrow" beside it rather
 * than instead of it. A screen that only says "Tomorrow" makes you work out
 * which day that is before you can act on it.
 */
export function DaySwitcher({
  date,
  today,
  onDate,
}: {
  date: string
  today: string
  onDate: (next: string) => void
}) {
  const back = stepDay(date, -1, today)
  const forward = stepDay(date, 1, today)
  const relative = relativeDayLabel(date, today)

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        size="sm"
        aria-label="The day before"
        disabled={back === null}
        onClick={() => back && onDate(back)}
      >
        <CaretLeft size={16} />
      </IconButton>
      <span className="flex min-w-0 items-baseline gap-2 px-1">
        <span className="text-sm whitespace-nowrap text-ink">{formatLongDate(date)}</span>
        {relative && <span className="text-2xs whitespace-nowrap text-ink-3">{relative}</span>}
      </span>
      <IconButton
        size="sm"
        aria-label="The day after"
        disabled={forward === null}
        onClick={() => forward && onDate(forward)}
      >
        <CaretRight size={16} />
      </IconButton>
      {date !== today && (
        <Button variant="ghost" size="sm" onClick={() => onDate(today)}>
          Today
        </Button>
      )}
    </div>
  )
}
