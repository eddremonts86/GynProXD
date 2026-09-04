import { useGym } from '../store/useGym'
import { useMessages } from '../store/useMessages'
import { useSession } from '../store/useSession'
import { challengeCalendar } from './challenge'
import { commitmentsOn } from './local-events'
import { outingsOn } from './nearby-events'
import { INTIMACY_LABEL, INTIMACY_MINUTES, intimacyVisible } from './intimacy'
import { viewerFor } from './profiles'
import { buildDay, weekdayOf, type DayPlan } from './day-plan'
import { emptyLifeProfile, type LifeProfile } from './life-profile'

/**
 * One place assembles the day, because two places assembling it is how they
 * come to disagree. `viewerFor` in `profiles.ts` exists for the same reason and
 * says so at more length.
 *
 * The plate is a parameter rather than something this hook fetches. `/day`
 * already asks `useDayPlates` for it; Today's one-line summary must not, since
 * that would put a recipe-catalogue request on the app's most visited screen to
 * render a sentence.
 *
 * That costs nothing in accuracy, and the reason is worth knowing before
 * somebody "fixes" it: the training session is placed before the plate, so it
 * lands in the same gap whether or not a plate is in the input. The time Today
 * prints is the time `/day` shows. Reorder the placement in `buildDay` and that
 * stops being true.
 *
 * Nothing here is memoised. It was, and the lint rule pointed out that the
 * memoisation could not be proven to hold, which is the rule doing its job:
 * `buildDay` is a dozen array operations over a handful of items and none of
 * this feeds an effect, so a `useMemo` here was buying nothing and asking a
 * reader to work out whether it was load-bearing.
 */

/** What a session is assumed to cost when no programme has said. */
const FALLBACK_SESSION_MINUTES = 60

export interface DayPlate {
  label: string
  ref?: string
}

type Plans = ReturnType<typeof useGym.getState>['plans']
type GeneratedPlans = ReturnType<typeof useGym.getState>['generatedPlans']
type Challenges = ReturnType<typeof useGym.getState>['challenges']

function trainingFor(
  plans: Plans,
  generatedPlans: GeneratedPlans,
  weekday: ReturnType<typeof weekdayOf>,
): { label: string; minutes: number; ref: string } | null {
  if (!weekday) return null
  const minutes =
    [...generatedPlans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.input
      .minsPerSession ?? FALLBACK_SESSION_MINUTES
  for (const plan of plans) {
    const day = plan.days.find((d) => d.day === weekday)
    if (!day || day.exercises.length === 0) continue
    return { label: plan.name, minutes, ref: plan.id }
  }
  return null
}

function challengeFor(challenges: Challenges, date: string): DayPlate | null {
  for (const active of challenges) {
    const today = challengeCalendar(active, date).find((d) => d.isToday && !d.done)
    if (!today) continue
    const unit = active.challenge.unit === 'reps' ? 'reps' : 'seconds'
    return { label: `${active.challenge.name}, ${today.reps} ${unit}`, ref: active.challenge.id }
  }
  return null
}

export function useDayPlan(date: string, plate: DayPlate | null = null): {
  plan: DayPlan
  profile: LifeProfile
} {
  const stored = useGym((s) => s.lifeProfile)
  const plans = useGym((s) => s.plans)
  const generatedPlans = useGym((s) => s.generatedPlans)
  const challenges = useGym((s) => s.challenges)
  const messages = useMessages((s) => s.messages)
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const pro = useSession((s) => s.pro)

  const profile = stored ?? emptyLifeProfile()
  const weekday = weekdayOf(date)

  /* The planner's day for this weekday: the first plan with anything on it,
     which is the rule Today already uses to decide what is scheduled. */
  const training = trainingFor(plans, generatedPlans, weekday)
  const challenge = challengeFor(challenges, date)
  /* `viewerFor` rather than a hand-assembled `{ id, gym }`, and `inboxFor`
     inside `commitmentsOn` rather than a second answer to who a message
     reaches. `profiles.ts` records what it cost the last time six screens each
     worked that out for themselves. */
  const commitments = [
    ...(profileId ? commitmentsOn(messages, viewerFor(profileId, gym), date) : []),
    /* And the ticketed events they added themselves, which are commitments in
       the same sense: an hour they said they would be somewhere. */
    ...outingsOn(profile.outings ?? [], date),
  ]

  /* Read on every render rather than subscribed to, because the switch lives in
     localStorage on purpose and nothing re-renders on a write to it. The one
     screen that can change it navigates away to do so, which remounts this. */
  const intimacy = intimacyVisible(pro)
    ? { label: INTIMACY_LABEL, minutes: INTIMACY_MINUTES }
    : null

  return {
    plan: buildDay({ date, profile, training, plate, challenge, commitments, intimacy }),
    profile,
  }
}
