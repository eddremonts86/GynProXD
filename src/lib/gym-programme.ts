import { allowedExerciseIds, assemblePlan, type ProgrammeStructure } from './plan-generator'
import type {
  BlockPlan,
  DurationKey,
  GeneratedPlan,
  OnboardingInput,
  PlannedDay,
} from './types'

/**
 * A programme a gym puts its name on, and what may travel with it.
 *
 * The obvious implementation is to publish the `GeneratedPlan` the operator
 * designed, and it is a data leak: a `GeneratedPlan` carries its `input`, which
 * is somebody's age, weight, target weight, height — and `limitations`, the
 * field where an injury is written down. Publishing one would broadcast the
 * operator's body and their bad knee to every member of the gym. This app tells
 * members their training never leaves their device; the first feature that
 * quietly published a person's training would make that a lie told to the
 * people who trusted it most.
 *
 * So what is published is the **structure** — blocks of days of movement ids —
 * plus the shape it was designed around, which is training information rather
 * than personal information: how many days a week, how long a session, what
 * equipment, what level, what goal.
 *
 * The member's own numbers come back in on adoption. `assemblePlan` recomputes
 * their timeline, their dates and their milestones from their own input, so a
 * gym publishes a plan and each member gets their own calendar of it. Which is
 * also the better product: the gym is the coach, not the calendar.
 */

export interface GymProgramme {
  id: string
  /** The gym's own name for it. */
  name: string
  blurb?: string
  /** Whose it is, as a member reads it. */
  gym: string
  /** The shape it was written for. Training facts, not personal ones. */
  daysPerWeek: number
  minsPerSession: number
  equipment: OnboardingInput['equipment']
  level: OnboardingInput['level']
  duration: DurationKey
  /** One block per four weeks, cycled. Dateless by construction. */
  blocks: BlockPlan[]
  source?: 'coach' | 'standard'
}

/**
 * Every field of `OnboardingInput` that describes a person rather than their
 * training. Named here so the test can walk the list, and so adding a field to
 * the intake makes somebody decide which side of this line it falls on.
 */
export const PERSONAL_INPUT_KEYS = [
  'age',
  'sex',
  'weightKg',
  'targetWeightKg',
  'heightCm',
  'goal',
  'limitations',
  'avoid',
  'constraints',
  'trainingDays',
  'effort',
] as const

/** A dateless day, which is the difference between a structure and a diary. */
function undated(day: { day: PlannedDay['day']; exercises: PlannedDay['exercises']; ecNote?: string }): PlannedDay {
  return {
    day: day.day,
    exercises: day.exercises.map((e) => ({ ...e })),
    ...(day.ecNote ? { ecNote: day.ecNote } : {}),
  }
}

/**
 * The publishable half of a designed plan.
 *
 * The blocks are recovered from the calendar rather than kept alongside it,
 * because `GeneratedPlan` stores `blocks` as metadata only — the days live in
 * `weeks`, tagged with `blockIndex`. One week per block is enough: the calendar
 * repeats them, so the second week of a block is the first one again with later
 * dates — but it has to be a *whole* week, and the first one need not be.
 */
export function programmeFromPlan(
  plan: GeneratedPlan,
  gym: string,
  name: string,
  blurb?: string,
  id = `gp-${plan.id}`,
): GymProgramme {
  /**
   * The fullest week of each block, not the first one.
   *
   * The first week of a plan begun mid-week is short by however many training
   * days had already gone — weeks are calendar weeks, so a Tuesday start has no
   * Monday session in week one. Taking the first week seen would publish that
   * gap to every member of the gym as if it were the programme, which it is
   * not: it is an artefact of the day its designer happened to press the
   * button.
   */
  const byBlock = new Map<number, PlannedDay[]>()
  for (const week of plan.weeks) {
    const index = week.blockIndex ?? 0
    const held = byBlock.get(index)
    if (held && held.length >= week.days.length) continue
    byBlock.set(index, week.days.map(undated))
  }

  const blocks: BlockPlan[] = [...byBlock.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, days]) => ({ days, ...(plan.blocks?.[index] ?? {}) }))

  return {
    id,
    name: name.trim(),
    ...(blurb?.trim() ? { blurb: blurb.trim() } : {}),
    gym,
    /* Read off the plan's own input, and only these four. Anything else on that
       object is the operator's body — `goal` included: it is what one person
       wants for theirs, and putting it on the card told a member who came to
       build muscle that this programme was for losing fat. The gym says what it
       is for in `blurb`, in its own words. */
    daysPerWeek: plan.input.daysPerWeek,
    minsPerSession: plan.input.minsPerSession,
    equipment: plan.input.equipment,
    level: plan.input.level,
    duration: plan.approvedDuration,
    blocks: blocks.length > 0 ? blocks : [{ days: [] }],
    /* `plan.coachNotes` is deliberately left behind. It is prose written to the
       designer about the plan built for *their* body, so it says things like
       "ACL precautions are strictly followed" — the injury, in a field that
       looked harmless because the field itself carries nothing personal. The
       end-to-end audit caught it on a member's screen. What members read
       instead is `blurb`: words the operator chose to write to them. */
    ...(plan.source ? { source: plan.source } : {}),
  }
}

/**
 * What a member should be told before they take one.
 *
 * A programme written for a full gym is not wrong for somebody training in a
 * living room — it is undoable, and handing it over silently would put barbell
 * work in the planner of somebody with no barbell. `assemblePlan` does not
 * filter: the structure is fixed by the time it gets there, which is exactly
 * why this has to be said on the card rather than fixed underneath.
 */
export function programmeMismatch(
  programme: GymProgramme,
  mine: OnboardingInput,
): string | null {
  const theirs = new Set(allowedExerciseIds(programme.equipment))
  const ours = new Set(allowedExerciseIds(mine.equipment))
  const unreachable = [...theirs].filter((id) => !ours.has(id))
  if (unreachable.length === 0) return null

  const used = new Set(
    programme.blocks.flatMap((b) => b.days.flatMap((d) => d.exercises.map((e) => e.exerciseId))),
  )
  const blocked = [...used].filter((id) => !ours.has(id))
  if (blocked.length === 0) return null

  return `${blocked.length} of its ${used.size} movements need equipment you have not got. It was written for ${LABELS[programme.equipment] ?? programme.equipment}.`
}

const LABELS: Record<string, string> = {
  barbell: 'a full gym',
  bodyweight: 'a room and a floor',
  hibrido: 'a gym and a room',
}

/**
 * The gym's structure, on the member's calendar.
 *
 * Their input, their duration, their dates, their milestones — computed by the
 * same `assemblePlan` their own designer uses. The gym supplies the training and
 * nothing else, which is the whole shape of this feature.
 */
export function adoptProgramme(
  programme: GymProgramme,
  mine: OnboardingInput,
  startDate = new Date(),
  id?: string,
): GeneratedPlan {
  const structure: ProgrammeStructure = {
    source: programme.source ?? 'standard',
    name: programme.name,
    /* The gym's own description of the programme, in the slot the member's plan
       page reads for "what is this". Never the designer's coach notes — see
       `programmeFromPlan`. */
    ...(programme.blurb ? { coachNotes: programme.blurb } : {}),
    blocks: programme.blocks,
  }
  /* The member's own days and session length win over the gym's: those are the
     hours they actually have, and a programme they cannot attend is not a
     programme. The movements are the gym's. */
  const plan = assemblePlan(mine, programme.duration, structure, startDate)
  return id ? { ...plan, id } : plan
}

/**
 * The id a member's copy of one message's programme gets.
 *
 * Derived from the message rather than random, so the inbox can ask "is it
 * already on my calendar" by looking for it — and so pressing the button twice
 * cannot leave somebody with two copies of the same twelve weeks to reconcile.
 */
export function adoptedPlanId(messageId: string): string {
  return `gen-adopted-${messageId}`
}
