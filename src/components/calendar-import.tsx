import { useRef, useState } from 'react'
import { CalendarPlus, DownloadSimple, Trash } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import { IMPORT_DAYS, type BusyBlock } from '@/lib/life-profile'
import { parseIcs, toIcs, type IcsEvent } from '@/lib/ics'
import { formatShortDate } from '@/lib/labels'
import type { DayPlan } from '@/lib/day-plan'

/**
 * A calendar file in, a day plan out. No account, no token, no server.
 *
 * The trade this makes deliberately: two-way sync would mean our server
 * holding a credential that can read somebody's whole calendar forever, and
 * that is a different product with a different privacy story. A file the member
 * picks costs them one export and buys the thing that actually matters, which
 * is that the planner stops putting the session inside Thursday's meeting.
 *
 * **Titles are shown and not stored, by default.** Those are two different
 * questions and they were worth separating. Reading a file somebody chose, on
 * their own device, to show them what is in it, is not a privacy event and the
 * review would be useless without it — every row would say "Busy 14:00" and
 * nobody could tell which to keep. Writing "oncology follow-up" into a record
 * that syncs is the question, and it is theirs to answer with the switch.
 */

interface Reviewed extends IcsEvent {
  keep: boolean
}

export function CalendarImport({
  busy,
  plan,
  onImport,
  onClear,
  today,
}: {
  busy: readonly BusyBlock[]
  plan: DayPlan
  onImport: (blocks: readonly Omit<BusyBlock, 'id'>[]) => number
  onClear: () => void
  today: string
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [found, setFound] = useState<Reviewed[] | null>(null)
  const [keepTitles, setKeepTitles] = useState(false)
  const [imported, setImported] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const windowEnd = (() => {
    const at = new Date(`${today}T00:00:00`)
    at.setDate(at.getDate() + IMPORT_DAYS)
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  })()

  const pick = async (file: File | undefined) => {
    setImported(null)
    setProblem(null)
    if (!file) return
    const text = await file.text()
    const events = parseIcs(text, { from: today, to: windowEnd })
    if (events.length === 0) {
      setFound(null)
      setProblem(
        'Nothing in the next three weeks that blocks time. All-day events and anything your calendar marks free are left out on purpose.',
      )
      return
    }
    setFound(events.map((event) => ({ ...event, keep: true })))
  }

  const commit = () => {
    if (!found) return
    const count = onImport(
      found
        .filter((event) => event.keep)
        .map((event) => ({
          date: event.date,
          start: event.start,
          end: event.end,
          ...(keepTitles ? { label: event.title.slice(0, 60) } : {}),
          source: 'ics' as const,
        })),
    )
    setImported(count)
    setFound(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const download = () => {
    const text = toIcs(
      plan.slots.map((slot) => ({
        date: plan.date,
        start: slot.start,
        end: slot.end,
        title: slot.label,
      })),
      `enForma, ${formatShortDate(plan.date)}`,
    )
    const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `enforma-${plan.date}.ics`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-3">
      <Panel padding="lg" className="flex flex-col gap-4">
        <p className="max-w-[62ch] text-sm text-ink-3">
          Export the next few weeks from whichever calendar you use and pick the file here. It
          reads {IMPORT_DAYS} days ahead, keeps only what blocks time, and never talks to your
          calendar itself.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/**
           * A file input, because the platform has one and it needs no
           * permission, no token and no round trip.
           *
           * `hidden` and not `sr-only`, matching the restore control in
           * Settings. An `sr-only` input stays in the accessibility tree, and
           * a file input in there with no label is exactly what the axe sweep
           * flagged: the button beside it is the labelled control, so the
           * input should not be a second unlabelled one.
           */}
          <input
            ref={fileInput}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            id="ics-file"
            onChange={(e) => void pick(e.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileInput.current?.click()}>
            <CalendarPlus size={16} />
            Pick a calendar file
          </Button>
          {plan.slots.length > 0 && (
            <Button variant="ghost" onClick={download}>
              <DownloadSimple size={16} />
              Send today to my calendar
            </Button>
          )}
          {busy.length > 0 && (
            <Button variant="dangerQuiet" size="sm" onClick={onClear}>
              <Trash size={16} />
              Forget {busy.length} imported
            </Button>
          )}
        </div>

        {problem && <p className="max-w-[62ch] text-sm text-ink-3">{problem}</p>}
        {imported !== null && (
          <p className="text-sm text-ink-3">
            {imported === 0
              ? 'Nothing new. Everything you kept was already on your days.'
              : imported === 1
                ? '1 block added to your days.'
                : `${imported} blocks added to your days.`}
          </p>
        )}
      </Panel>

      {found && (
        <Panel padding="none" className="divide-y divide-line">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3">
            <span className="text-sm text-ink">
              {found.length === 1 ? '1 event found' : `${found.length} events found`}
            </span>
            <label className="flex items-center gap-2 text-2xs text-ink-3">
              {/* An explicit name, because a custom switch inside a label is
                  not reliably associated with the text beside it. */}
              <Switch
                aria-label="Keep the titles"
                checked={keepTitles}
                onCheckedChange={setKeepTitles}
              />
              Keep the titles
            </label>
          </div>

          {found.map((event, index) => (
            <label
              key={`${event.date}-${event.start}-${index}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 p-3"
            >
              <input
                type="checkbox"
                className="size-4 accent-[var(--brand)]"
                checked={event.keep}
                onChange={(e) =>
                  setFound((current) =>
                    (current ?? []).map((row, i) =>
                      i === index ? { ...row, keep: e.target.checked } : row,
                    ),
                  )
                }
              />
              <span className="num w-[9.5rem] shrink-0 text-2xs text-ink-3">
                {`${formatShortDate(event.date)} ${event.start} to ${event.end}`}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{event.title}</span>
            </label>
          ))}

          <div className="flex flex-wrap items-center gap-3 p-3">
            <Button variant="primary" onClick={commit}>
              Add the ticked ones
            </Button>
            <Button variant="ghost" onClick={() => setFound(null)}>
              Cancel
            </Button>
            {!keepTitles && (
              <span className="max-w-[42ch] text-2xs text-ink-3">
                Titles are shown here and not saved. Your day will say "Busy".
              </span>
            )}
          </div>
        </Panel>
      )}

      {busy.length > 0 && !found && (
        <p className="text-2xs text-ink-3">
          {busy.length === 1 ? '1 block' : `${busy.length} blocks`} imported, kept until their day
          has passed.{' '}
          {busy.some((b) => b.label) ? 'Titles were saved.' : 'No titles were saved.'}
        </p>
      )}
    </div>
  )
}
