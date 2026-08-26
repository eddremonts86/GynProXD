import {
  allowedExerciseIds,
  assemblePlan,
  candidateIdsByMuscle,
  generatePlan,
  resolveDuration,
  type ProgrammeStructure,
} from './plan-generator'
import { GOAL_LABELS, LEVEL_LABELS, SEX_LABELS, TRAINING_PLACE_OPTIONS } from './labels'
import type {
  DayOfWeek,
  DurationKey,
  GeneratedPlan,
  OnboardingInput,
  PlannedDay,
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

export const aiCoachEnabled = __AI_COACH__

/**
 * Text-01 measured at roughly two minutes for a three-block programme; the
 * reasoning models (M2/M3) run far past that, which is why they are not used
 * here despite being the workspace default elsewhere.
 */
const REQUEST_TIMEOUT_MS = 180_000
const DAY_VALUES: DayOfWeek[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const PROGRESSIONS: ProgressionRule[] = ['none', 'linear', 'double']

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
  return null
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
): PlannedDay[][] | null {
  const response = raw as RawResponse
  if (!response || !Array.isArray(response.blocks) || response.blocks.length === 0) return null
  const allowed = allowedExerciseIds(input.equipment)

  const blocks: PlannedDay[][] = []
  for (const rawBlock of response.blocks.slice(0, maxBlocks)) {
    const rawDays = (rawBlock as { days?: unknown })?.days
    if (!Array.isArray(rawDays) || rawDays.length !== Math.min(input.daysPerWeek, 7)) return null

    const byDay = new Map<DayOfWeek, PlannedExercise[]>()
    const notesByDay = new Map<DayOfWeek, string>()
    for (const rawDay of rawDays as RawDay[]) {
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

    blocks.push(
      DAY_VALUES.map((d) => ({
        day: d,
        exercises: byDay.get(d) ?? [],
        ecNote: notesByDay.get(d),
      })),
    )
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
${rate > 0 ? `- Weight pace is fixed at ${rate} kg/week by a separate calculation. Do not mention or change it.` : ''}

Requirements:
- Design exactly ${blockCount} four-week training block(s). Blocks repeat in rotation. Each block after the first MUST swap at least half of the movements on every day for different ids from the list; changing only reps does not count.
- Each block is one training week: exactly ${input.daysPerWeek} days, values from mon,tue,wed,thu,fri,sat,sun, sensibly spaced, no duplicates.
- ${perDay} movements per day, compounds first.
- Use ONLY these movement ids, spelled verbatim:
${catalogue}
- progression per movement: "linear" (add 2.5 kg each session), "double" (build reps to the top of the range, then add weight), or "none" (stretches, easy accessories). Beginners: mostly linear on compounds.
- supersetGroup pairs accessories back to back: "A", "B", "C" or null. Never superset the main compound.
- timed is true only for holds such as planks. unilateral is true only for one-side-at-a-time movements.
- ecNote per day: ONE short optional extra-credit line for anyone who finishes with something left, at most 120 characters. Concrete and additive, e.g. "Add a fourth set on the first movement" or "Finish with a 90 second plank". Never required, never medical advice.

Reply with ONE minified JSON object on a single line, nothing else, exactly this shape:
{"planName":"...","coachNotes":"...","blocks":[{"days":[{"day":"mon","ecNote":"...","exercises":[{"exerciseId":"...","progression":"linear","supersetGroup":null,"timed":false,"unilateral":false}]}]}]}
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
      headers: { 'Content-Type': 'application/json' },
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
  if (aiCoachEnabled && !coachSwitchedOff()) {
    const { estimate, weeks } = resolveDuration(input, requested)
    const blockCount = Math.min(Math.max(1, Math.ceil(weeks / 4)), 3)
    const structure = await designWithCoach(input, blockCount, estimate.rateKgPerWeek)
    if (structure) return assemblePlan(input, requested, structure)
  }
  return generatePlan(input, requested)
}
