import { inboxFor, type GymMessage } from './messages'
import { minutesOf } from './life-profile'

/**
 * What is on locally, from the one source this product already has.
 *
 * A gym on the platform publishes events with a date, a time and a place, and
 * they already reach the member's inbox. Until now the day planner could not
 * see them, so somebody who had said they were coming to Saturday's class got a
 * day plan that scheduled a session on top of it.
 *
 * **Only an event they said yes to blocks time.** That distinction is the whole
 * rule and it is worth stating plainly: an RSVP is a commitment somebody made,
 * and a day planner has no business treating an invitation as one. Anything
 * unanswered stays in the inbox, where it already is and where answering it
 * belongs.
 *
 * `inboxFor` decides what reaches this member, and it is used rather than
 * re-implemented. `profiles.ts` records what happened the last time several
 * screens each worked out their own answer to that question: the day a third
 * field decided who a message reaches, five of the six disagreed.
 */

export interface Commitment {
  label: string
  /** `HH:MM`, local. */
  start: string
  end: string
  /** The message id, so the day can link back to the invitation. */
  ref: string
}

/**
 * How long a gym event is assumed to run.
 *
 * The bus carries a start and no end, so this is a guess and it is the only
 * guess in this file. An hour is the shape of a class, which is most of what a
 * gym publishes. The real fix is an end time in the composer, which is a change
 * to what a gym fills in rather than something to infer here — until then the
 * member has already said yes to this event and knows how long it runs.
 */
export const EVENT_MINUTES = 60

/**
 * The events this member committed to on this date.
 *
 * Pure, and given the inbox rather than the store, so the audience rules and
 * the placement can be tested apart from each other.
 */
export function commitmentsOn(
  messages: readonly GymMessage[],
  /**
   * Exactly what `viewerFor` returns, and not a field less.
   *
   * It was `{ id, gym? }` and TypeScript caught what that costs: `openToGyms`
   * decides whether an open-door message reaches somebody, so a narrower type
   * here silently dropped the opt-out and put a gym's event on the day of a
   * member who had switched that door shut. The shape of an audience check is
   * not this file's to decide.
   */
  viewer: { id: string; gym?: string; openToGyms?: boolean },
  date: string,
  now?: string,
): Commitment[] {
  const out: Commitment[] = []
  for (const message of inboxFor([...messages], viewer, now)) {
    if (message.kind !== 'event' || !message.event) continue
    if (message.event.date !== date) continue
    if (message.rsvp?.[viewer.id] !== 'yes') continue
    /* No time means no hour to place it at. The inbox still shows it; the day
       cannot say when, and inventing an hour for something somebody has
       committed to is the worst direction to guess in. */
    const start = minutesOf(message.event.time ?? '')
    if (start === null) continue
    const end = Math.min(start + EVENT_MINUTES, 24 * 60 - 1)
    if (end <= start) continue
    out.push({
      label: message.title,
      start: message.event.time!,
      end: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`,
      ref: message.id,
    })
  }
  return out.sort((a, b) => a.start.localeCompare(b.start))
}
