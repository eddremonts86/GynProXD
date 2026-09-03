import { motion, useReducedMotion } from 'motion/react'
import { Button } from '@/ui/Button'
import { Bar } from '@/components/route-skeleton'
import type { CoachHost } from '@/lib/capabilities'
import type { ReadState } from '@/hooks/use-day-read'

/**
 * What the day allows, in the model's words, beside the day.
 *
 * Four states and each one is a sentence somebody can act on. The idle one
 * says where the day goes before anything is sent, in the same terms the
 * intake uses, because a reading costs a metered call and, on most servers, a
 * trip to a vendor with the labels somebody typed. Busy is a skeleton the
 * height of the answer. Failed says which of three things happened, since a
 * closed cap is not a vendor that timed out and the next step differs.
 *
 * Nothing here is shown on a server with no coach: `offered` is false and the
 * block is absent, rather than present and apologising.
 */

const FAILED: Record<Exclude<ReadState, { kind: 'idle' | 'busy' | 'done' }>['why'], string> = {
  'no-coach': 'No coach on this server, so the day is not read.',
  cap: 'The coach has answered enough times for this account today. It opens again tomorrow.',
  unreachable: 'The coach could not be reached. Nothing on the day changed.',
  unreadable: 'The answer did not fit the day and was not used.',
}

function whereItGoes(host: CoachHost): string {
  return host === 'self'
    ? 'Read by a model running on our own hardware. It does not reach a third party.'
    : 'Your day, with its labels, is sent to our model provider to be read. Nothing on it changes.'
}

export function DayReadPanel({
  state,
  offered,
  host,
  onAsk,
}: {
  state: ReadState
  offered: boolean
  host: CoachHost
  onAsk: () => void
}) {
  const still = useReducedMotion() === true
  if (!offered) return null

  return (
    <section aria-labelledby="day-read-title" className="flex flex-col gap-3 border-t border-line pt-4">
      <h2 id="day-read-title" className="text-sm font-semibold text-ink">
        What the day allows
      </h2>

      {state.kind === 'idle' && (
        <>
          <p className="max-w-[48ch] text-2xs text-ink-3">{whereItGoes(host)}</p>
          <div>
            <Button variant="secondary" onClick={onAsk}>
              Read my day
            </Button>
          </div>
        </>
      )}

      {state.kind === 'busy' && (
        <div className="flex animate-pulse flex-col gap-2" aria-busy="true" aria-live="polite">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-11/12" />
          <Bar className="h-4 w-2/3" />
          <span className="sr-only">Reading the day</span>
        </div>
      )}

      {state.kind === 'done' && (
        <motion.div
          className="flex flex-col items-start gap-3"
          initial={still ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
        >
          <p className="max-w-[48ch] text-sm leading-relaxed text-ink">{state.read.read}</p>
          <p className="text-2xs text-ink-3">
            {state.read.notes.length === 0
              ? 'Nothing suggested for the gaps.'
              : state.read.notes.length === 1
                ? '1 suggestion, in the gap it is about.'
                : `${state.read.notes.length} suggestions, each in the gap it is about.`}
          </p>
          <Button variant="ghost" size="sm" onClick={onAsk}>
            Read again
          </Button>
        </motion.div>
      )}

      {state.kind === 'failed' && (
        <div className="flex flex-col items-start gap-3">
          <p className="max-w-[48ch] text-sm text-ink-3">{FAILED[state.why]}</p>
          {state.why !== 'cap' && state.why !== 'no-coach' && (
            <Button variant="ghost" size="sm" onClick={onAsk}>
              Try again
            </Button>
          )}
        </div>
      )}
    </section>
  )
}
