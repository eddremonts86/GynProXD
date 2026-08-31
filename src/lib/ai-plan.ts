import {
  allowedExerciseIds,
  assemblePlan,
  candidateIdsByMuscle,
  generatePlan,
  resolveDuration,
  type ProgrammeStructure,
} from './plan-generator'
import { GOAL_LABELS, LEVEL_LABELS, SEX_LABELS, TRAINING_PLACE_OPTIONS } from './labels'
import { serverCapabilities } from './capabilities'
import { activeAuthHeader } from './sync'
import type {
  BlockPlan,
  DayOfWeek,
  DurationKey,
  GeneratedPlan,
  Intensity,
  OnboardingInput,
  PlannedExercise,
  ProgressionRule,
} from './types'

/**
 * The AI coach designs the programme's structure: split, movement selection,
 * progression and supersets. It never touches the arithmetic. Timelines and
 * safe rates stay computed locally, because "realistic over optimistic" is the
 * product and a language model must not be allowed to negotiate it.
 *
 * The key lives server-side behind the /api/minimax proxy. No key, a timeout,
 * or a response that fails validation all land on the deterministic generator.
 */

/**
 * The coach exists when the dev proxy carries a key (build flag) or the sync
 * server says it does — the latter only helps a signed-in member, since the
 * server route is auth-gated to keep the key from being burned anonymously.
 */
export function aiCoachEnabled(): boolean {
  return __AI_COACH__ || (serverCapabilities().coach && activeAuthHeader() !== null)
}

/**
 * Text-01 measured at roughly two minutes for a three-block programme; the
 * reasoning models (M2/M3) run far past that, which is why they are not used
 * here despite being the workspace default elsewhere.
 */
const REQUEST_TIMEOUT_MS = 180_000
const DAY_VALUES: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PROGRESSIONS: ProgressionRule[] = ['none', 'linear', 'double']
/* The three the intake offers. A block may name one of these and no other, so a
   hallucinated place cannot conjure a pool the programme never authorised. */
const PLACE_VALUES: OnboardingInput['equipment'][] = ['hibrido', 'barbell', 'bodyweight']

interface RawExercise {
  exerciseId?: unknown
  progression?: unknown
  supersetGroup?: unknown
  timed?: unknown
  unilateral?: unknown
}

interface RawDay {
  day?: unknown
  exercises?: unknown
  ecNote?: unknown
}

interface RawResponse {
  planName?: unknown
  coachNotes?: unknown
  blocks?: unknown
}

/** Drops the reasoning preamble and pulls the first balanced JSON object. */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '')
  const start = cleaned.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (escaped) {
      escaped = false
    } else if (ch === '\\') {
      escaped = inString
    } else if (ch === '"') {
      inString = !inString
    } else if (!inString && ch === '{') {
      depth += 1
    } else if (!inString && ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }

  /**
   * Nothing balanced, so the answer was cut off. Close it and try once.
   *
   * Measured, not imagined: MiniMax-Text-01 returns `finish_reason: "stop"` and
   * a body one `]}` short of valid, having spent 1,830 of an allowed 4,000
   * tokens. It is not hitting a cap and it is not being interrupted — it stops
   * mid-structure and reports success. A whole programme, three blocks of real
   * work, was being discarded over two characters.
   *
   * Only closers are ever appended, and only in the order the scan says are
   * open. Nothing is invented: a truncated exercise or a half-written day comes
   * back as an object with missing fields, which `validateBlocks` then judges on
   * its merits — a day left under three movements is still refused. This turns
   * "unparseable" into "parseable and possibly incomplete", and lets the check
   * that already exists do the deciding.
   */
  const closers: string[] = []
  let depth2 = 0
  let inStr2 = false
  let esc2 = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (esc2) {
      esc2 = false
    } else if (ch === '\\') {
      esc2 = inStr2
    } else if (ch === '"') {
      inStr2 = !inStr2
    } else if (!inStr2 && (ch === '{' || ch === '[')) {
      closers.push(ch === '{' ? '}' : ']')
      depth2 += 1
    } else if (!inStr2 && (ch === '}' || ch === ']')) {
      closers.pop()
      depth2 -= 1
    }
  }
  if (closers.length === 0 || depth2 <= 0) return null

  /* A string left open would swallow the closers as text. Shut it first. */
  let tail = cleaned.slice(start) + (inStr2 ? '"' : '')
  /* Trailing comma or a half-written key: drop back to the last complete value. */
  tail = tail.replace(/[,\s]*$/, '').replace(/,\s*"[^"]*"?\s*:?\s*$/, '')
  try {
    return JSON.parse(tail + closers.reverse().join(''))
  } catch {
    return null
  }
}

/** The em-dash ban applies to model output too. */
function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim()
  return text.length > 0 ? text.slice(0, maxLength) : undefined
}

/**
 * Hard validation: every id must exist and match the equipment, every day must
 * be a real weekday used once, and each day needs at least three survivors.
 * Anything less falls back rather than shipping a half-hallucinated week.
 */
export function validateBlocks(
  raw: unknown,
  input: OnboardingInput,
  maxBlocks: number,
): BlockPlan[] | null {
  const response = raw as RawResponse
  if (!response || !Array.isArray(response.blocks) || response.blocks.length === 0) return null
  /**
   * The programme's own pool, and the ceiling for every block.
   *
   * A block may say it trains somewhere narrower — that is the point of letting
   * one differ from the next — but it may never reach past this. Intersecting
   * rather than replacing is what stops a coach handing barbells to a member who
   * said they train in a living room. Widening happens once, upstream: the intake
   * reads two places in one sentence and answers `hibrido`, whose pool holds both.
   */
  const programmePool = allowedExerciseIds(input.equipment)

  const blocks: BlockPlan[] = []
  for (const rawBlock of response.blocks.slice(0, maxBlocks)) {
    const rawPlace = (rawBlock as { place?: unknown })?.place
    const place =
      typeof rawPlace === 'string' && PLACE_VALUES.includes(rawPlace as OnboardingInput['equipment'])
        ? (rawPlace as OnboardingInput['equipment'])
        : undefined
    /**
     * The narrowed pool is a preference, not a gate.
     *
     * It started as a filter and that was wrong in a way only the live coach
     * showed: told "the first month at home", it labels block 1 `bodyweight` and
     * fills it with press-ups, a bodyweight squat and a dumbbell row — which is
     * what a living room with dumbbells actually looks like, and what the member
     * authorised when the intake read two places and answered `hibrido`.
     * Filtering strictly dropped the dumbbell work, took the day under three
     * movements, and rejected the whole programme. The feature added to make
     * phasing possible was rejecting the phased answer.
     *
     * `place` is metadata now: it names the block on screen and it steers the
     * coach through the prompt. The guarantee that matters is unchanged and
     * lives one line up — `programmePool` is built from what the member said,
     * and nothing reaches past it.
     */
    const allowed = programmePool

    const rawIntensity = (rawBlock as { intensity?: unknown })?.intensity
    const intensity =
      typeof rawIntensity === 'string' && ['I', 'II', 'III'].includes(rawIntensity)
        ? (rawIntensity as Intensity)
        : undefined
    const label = cleanText((rawBlock as { label?: unknown })?.label, 28)

    /**
     * More days than asked for is trimmed. Fewer is still a rejection.
     *
     * This was `!==`, and it was throwing away good programmes whole. Measured
     * against MiniMax-Text-01 on the real prompt: three blocks, correct labels,
     * places running bodyweight then hibrido then barbell — the phasing the
     * member actually asked for — and not one hallucinated movement id. Rejected,
     * and replaced by the deterministic template, because it had added a light
     * Saturday to a three-day week.
     *
     * A coach that offers a fourth day has understood the brief and been
     * generous with it. A coach that returns two days for a three-day week has
     * not, and there is nothing to salvage there, so that half of the check
     * stays exactly as strict as it was.
     */
    const rawDays = (rawBlock as { days?: unknown })?.days
    const wantedDays = Math.min(input.daysPerWeek, 7)
    if (!Array.isArray(rawDays) || rawDays.length < wantedDays) return null

    /* Which days to keep when there are too many: the ones the member named, if
       they named any. Dropping Wednesday from someone who told us Monday,
       Wednesday and Friday would be a stranger failure than the one being fixed. */
    const preferred = new Set<string>(input.trainingDays ?? [])
    const chosenDays =
      rawDays.length === wantedDays
        ? rawDays
        : [...(rawDays as RawDay[])]
            .map((d, i) => ({ d, i, named: preferred.has(String(d?.day)) }))
            .sort((a, b) => (a.named === b.named ? a.i - b.i : a.named ? -1 : 1))
            .slice(0, wantedDays)
            .sort((a, b) => a.i - b.i)
            .map((x) => x.d)

    const byDay = new Map<DayOfWeek, PlannedExercise[]>()
    const notesByDay = new Map<DayOfWeek, string>()
    for (const rawDay of chosenDays as RawDay[]) {
      const day = rawDay?.day as DayOfWeek
      if (!DAY_VALUES.includes(day) || byDay.has(day)) return null
      if (!Array.isArray(rawDay.exercises)) return null

      const seen = new Set<string>()
      const exercises: PlannedExercise[] = []
      for (const rawEx of rawDay.exercises as RawExercise[]) {
        const id = rawEx?.exerciseId
        if (typeof id !== 'string' || !allowed.has(id) || seen.has(id)) continue
        seen.add(id)
        const progression = PROGRESSIONS.includes(rawEx.progression as ProgressionRule)
          ? (rawEx.progression as ProgressionRule)
          : 'none'
        const group =
          typeof rawEx.supersetGroup === 'string' &&
          ['A', 'B', 'C'].includes(rawEx.supersetGroup.toUpperCase())
            ? rawEx.supersetGroup.toUpperCase()
            : undefined
        exercises.push({
          exerciseId: id,
          progression,
          supersetGroup: group ?? null,
          timed: rawEx.timed === true,
          unilateral: rawEx.unilateral === true,
        })
      }
      if (exercises.length < 3) return null
      byDay.set(day, exercises.slice(0, 8))
      const note = cleanText(rawDay.ecNote, 120)
      if (note) notesByDay.set(day, note)
    }

    blocks.push({
      days: DAY_VALUES.map((d) => ({
        day: d,
        exercises: byDay.get(d) ?? [],
        ecNote: notesByDay.get(d),
      })),
      label: label || undefined,
      place,
      intensity,
    })
  }
  return blocks.length > 0 ? blocks : null
}

export function buildPrompt(input: OnboardingInput, blockCount: number, rate: number): string {
  const place =
    TRAINING_PLACE_OPTIONS.find((o) => o.value === input.equipment)?.label ?? input.equipment
  const perDay = input.minsPerSession <= 45 ? 4 : input.minsPerSession <= 75 ? 5 : 6
  const candidates = candidateIdsByMuscle(input.equipment, 10)
  const catalogue = Object.entries(candidates)
    .map(([muscle, ids]) => `${muscle}: ${ids.join(', ')}`)
    .join('\n')

  return `Design a training programme.

Athlete:
- ${input.age} years old, ${SEX_LABELS[input.sex].toLowerCase()}, ${input.weightKg} kg${input.targetWeightKg ? `, target ${input.targetWeightKg} kg` : ''}${input.heightCm ? `, ${input.heightCm} cm` : ''}
- Goal: ${GOAL_LABELS[input.goal]}. Experience: ${LEVEL_LABELS[input.level]}.
- Trains ${input.daysPerWeek} days a week, ${input.minsPerSession} minutes per session. Training at: ${place}.
${input.trainingDays?.length ? `- The days are fixed: ${input.trainingDays.join(', ')}. Use exactly these and space the work to suit them — two in a row is a different programme from every other day.` : ''}
${input.limitations ? `- TRAIN AROUND THIS, in their words: "${input.limitations}". Leave out anything that loads it. Do not substitute a lighter version of the same movement, and do not mention it back to them as advice.` : ''}
${input.avoid ? `- They do not want: ${input.avoid}. Honour it even where a replacement is worse on paper; a programme nobody follows trains nobody.` : ''}
${rate > 0 ? `- Weight pace is fixed at ${rate} kg/week by a separate calculation. Do not mention or change it.` : ''}
${
  input.constraints
    ? `
In their own words, between the markers. Read it for everything the fields above cannot hold, and let it win where it plainly disagrees with them:
--- BEGIN
${input.constraints}
--- END
- Injuries, pain and movements to avoid live here and nowhere else. Honour them by leaving the movement out, not by working around it half way.
- If those words describe a plan that CHANGES OVER TIME, build the change into the blocks. A block is four weeks. "The first month at home and then the gym" means block 1 uses only what a home has and later blocks use the rest. "Start moderate then go hard" means difficulty and volume climb between blocks instead of staying level.
- Typos and loose phrasing are theirs to make and yours to read past.`
    : ''
}

Requirements:
- Design exactly ${blockCount} four-week training block(s). Blocks repeat in rotation. Each block after the first MUST swap at least half of the movements on every day for different ids from the list; changing only reps does not count.
- Give every block a "label" of at most 28 characters naming what it is for, e.g. "Home base" or "Gym, heavier".
- Give every block a "place": "bodyweight" for a room and a floor, "barbell" for a full gym, "hibrido" for both. It may only be NARROWER than the athlete's own setting above, never wider — a block cannot reach equipment they do not have. When their words describe moving from one place to another, that move belongs here.
- Give every block an "intensity": "I" fewer sets, "II" normal, "III" more. Use it to make the blocks differ in volume as well as in movements, and follow their words about how hard they mean to go.
- Each block is one training week: exactly ${input.daysPerWeek} days, values from mon,tue,wed,thu,fri,sat,sun, sensibly spaced, no duplicates.
- About ${perDay} movements per day, compounds first. Vary it with the block's intensity: a "I" block runs one fewer, a "III" block one more. Never fewer than three.
- Use ONLY these movement ids, spelled verbatim:
${catalogue}
- progression per movement: "linear" (add 2.5 kg each session), "double" (build reps to the top of the range, then add weight), or "none" (stretches, easy accessories). Beginners: mostly linear on compounds.
- supersetGroup pairs accessories back to back: "A", "B", "C" or null. Never superset the main compound.
- timed is true only for holds such as planks. unilateral is true only for one-side-at-a-time movements.
- ecNote per day: ONE short optional line for anyone who finishes the day with something left, at most 120 characters. Concrete and additive, e.g. "Add a fourth set on the first movement" or "Finish with a 90 second plank". Never required, never medical advice.

Reply with ONE minified JSON object on a single line, nothing else, exactly this shape:
{"planName":"...","coachNotes":"...","blocks":[{"label":"...","place":"hibrido","intensity":"II","days":[{"day":"mon","ecNote":"...","exercises":[{"exerciseId":"...","progression":"linear","supersetGroup":null,"timed":false,"unilateral":false}]}]}]}
planName: at most 40 characters, no dates. coachNotes: 2 or 3 plain sentences on how the programme is built and why the blocks differ. No medical claims, no hyphens used as dashes.`
}

async function designWithCoach(
  input: OnboardingInput,
  blockCount: number,
  rate: number,
): Promise<ProgrammeStructure | null> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/minimax/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(activeAuthHeader() ?? {}) },
      signal: controller.signal,
      body: JSON.stringify({
        model: __AI_COACH_MODEL__,
        max_tokens: 4000,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a pragmatic strength and conditioning coach. You respond with a single JSON object and nothing else.',
          },
          { role: 'user', content: buildPrompt(input, blockCount, rate) },
        ],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return null

    const parsed = extractJson(content)
    const blocks = validateBlocks(parsed, input, blockCount)
    if (!blocks) return null

    const response = parsed as RawResponse
    return {
      source: 'coach',
      name: cleanText(response.planName, 40),
      coachNotes: cleanText(response.coachNotes, 420),
      blocks,
    }
  } catch {
    return null
  } finally {
    window.clearTimeout(timer)
  }
}

/** Kill switch for tests and impatient humans: localStorage forma-coach=off. */
function coachSwitchedOff(): boolean {
  try {
    return localStorage.getItem('forma-coach') === 'off'
  } catch {
    return false
  }
}

/** The one entry point the UI calls. Always resolves to a usable plan. */
export async function buildProgramme(
  input: OnboardingInput,
  requested: DurationKey,
): Promise<GeneratedPlan> {
  if (aiCoachEnabled() && !coachSwitchedOff()) {
    const { estimate, weeks } = resolveDuration(input, requested)
    const blockCount = Math.min(Math.max(1, Math.ceil(weeks / 4)), 3)
    const structure = await designWithCoach(input, blockCount, estimate.rateKgPerWeek)
    if (structure) return assemblePlan(input, requested, structure)
  }
  return generatePlan(input, requested)
}
