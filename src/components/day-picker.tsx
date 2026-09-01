import { cn } from '@/lib/utils'
import type { DayOfWeek } from '../lib/types'

const DAYS: { value: DayOfWeek; short: string; full: string }[] = [
  { value: 'mon', short: 'M', full: 'Monday' },
  { value: 'tue', short: 'T', full: 'Tuesday' },
  { value: 'wed', short: 'W', full: 'Wednesday' },
  { value: 'thu', short: 'T', full: 'Thursday' },
  { value: 'fri', short: 'F', full: 'Friday' },
  { value: 'sat', short: 'S', full: 'Saturday' },
  { value: 'sun', short: 'S', full: 'Sunday' },
]

/**
 * Which days, not how many.
 *
 * Monday-Wednesday-Friday and Saturday-Sunday are the same `daysPerWeek` and two
 * different programmes: one alternates and recovers, the other stacks two hard
 * sessions back to back and has to be built for it. The intake could only ever
 * say "3", and the split was assigned from a formula that had no idea.
 *
 * Optional on purpose. Somebody who does not know which days yet should not be
 * made to invent an answer — leaving it empty means the same spacing the app has
 * always chosen, and the count comes from the number field beside it.
 */
export function DayPicker({
  value,
  onChange,
}: {
  value: DayOfWeek[]
  onChange: (days: DayOfWeek[]) => void
}) {
  const toggle = (d: DayOfWeek) =>
    onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-2xs font-medium text-ink-2">Which days, if you know</span>
      <div className="flex gap-1.5">
        {DAYS.map((d) => {
          const on = value.includes(d.value)
          return (
            <button
              key={d.value}
              type="button"
              onClick={() => toggle(d.value)}
              aria-pressed={on}
              aria-label={d.full}
              title={d.full}
              className={cn(
                'grid h-9 flex-1 place-items-center rounded-lg border text-xs font-medium transition-colors duration-150',
                'active:scale-[0.97]',
                on
                  ? 'border-brand bg-brand text-brand-ink'
                  : 'border-dashed border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
              )}
            >
              {d.short}
            </button>
          )
        })}
      </div>
      <p className="text-2xs text-ink-3">
        {value.length === 0
          ? 'Left empty, enForma spaces the sessions itself.'
          : value.length === 1
            ? 'One day chosen. The count above follows what you pick here.'
            : `${value.length} days chosen. Two in a row is a different programme from every other day, and the coach is told which you have.`}
      </p>
    </div>
  )
}
