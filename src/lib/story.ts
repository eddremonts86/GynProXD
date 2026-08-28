/**
 * Story programmes: a long walk told one day at a time, where the training
 * is the story rather than a reward bolted onto it. Structure is authored
 * data — never generated — so a member's progress can never be invalidated
 * by a model changing its mind. Progress is private and lives in the
 * encrypted profile snapshot.
 *
 * Two mechanics carry it, both stolen from what makes 60-day programmes
 * finish: a specialisation chosen a few days IN (when you know something
 * about yourself), and no rest days — recovery lives in the rotation, so a
 * streak never has to break.
 */

export type TrackId = 'load' | 'pace' | 'line'

export interface Track {
  id: TrackId
  name: string
  /** What the choice means in training terms, said plainly. */
  focus: string
  /** What it means in the story. */
  blurb: string
}

/** How hard the day is meant to be. Recovery is a light day, not a day off. */
export type DayWeight = 'heavy' | 'moderate' | 'light'

export interface StoryMovement {
  exerciseId: string
  /** Free text: "3 × 12", "60 s", "as far as you can in 5 min". */
  prescription: string
}

export interface StoryDay {
  day: number
  title: string
  /** The chapter. Written to be read in under a minute, before training. */
  chapter: string
  weight: DayWeight
  movements: StoryMovement[]
  /** Optional extra credit, same contract as the rest of the app. */
  ecNote?: string
  /** Present only on the day the fork is offered. */
  offersChoice?: boolean
  /** Chapter and movements that replace the defaults once a track is chosen. */
  byTrack?: Partial<Record<TrackId, { chapter?: string; movements?: StoryMovement[] }>>
}

export interface StoryProgram {
  id: string
  name: string
  tagline: string
  /** Total length of the finished programme, even if fewer days are written. */
  totalDays: number
  tracks: Track[]
  days: StoryDay[]
}

/** A member's place in a programme. Lives in the encrypted snapshot. */
export interface StoryProgress {
  programId: string
  startedAt: string
  track?: TrackId
  /** Day numbers marked done. Order-independent; a set in list form. */
  completedDays: number[]
}

export function dayCount(program: StoryProgram): number {
  return program.days.length
}

export function findDay(program: StoryProgram, day: number): StoryDay | undefined {
  return program.days.find((d) => d.day === day)
}

/**
 * The day the member is on: the first unfinished one, so catching up is
 * always possible and skipping ahead is not. Past the written days it
 * returns null — the programme has run out of chapters, not the member out
 * of progress.
 */
export function currentDay(program: StoryProgram, progress: StoryProgress): StoryDay | null {
  const done = new Set(progress.completedDays)
  for (const d of program.days) if (!done.has(d.day)) return d
  return null
}

/** Chapter and movements resolved against the chosen track. */
export function resolveDay(day: StoryDay, track: TrackId | undefined): {
  chapter: string
  movements: StoryMovement[]
} {
  const variant = track ? day.byTrack?.[track] : undefined
  return {
    chapter: variant?.chapter ?? day.chapter,
    movements: variant?.movements ?? day.movements,
  }
}

/** True once every written day is marked. */
export function isProgramComplete(program: StoryProgram, progress: StoryProgress): boolean {
  const done = new Set(progress.completedDays)
  return program.days.every((d) => done.has(d.day))
}

/**
 * The choice is offered once the member reaches the marked day and has not
 * chosen yet. Asking on day one would be asking a stranger to pick a
 * specialty; by day three they have felt three sessions.
 */
export function choiceIsDue(program: StoryProgram, progress: StoryProgress): boolean {
  if (progress.track) return false
  const day = currentDay(program, progress)
  return !!day?.offersChoice
}
