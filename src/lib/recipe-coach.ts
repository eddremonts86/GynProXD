import { extractJson } from './ai-plan'
import { GOAL_LABELS } from './labels'
import { rankSuggestions, type RecipeSuggestion } from './recipes'
import type { NutritionTarget } from './nutrition-target'
import type { OnboardingInput } from './types'

/**
 * The AI coach's food pass mirrors the training one: it may only reorder and
 * annotate dishes the app already fetched, referenced by id. It cannot add a
 * dish, so every pick keeps a real photo and real numbers by construction.
 * Any invalid response falls back to the deterministic ranking.
 */

/** Notes are one sentence; this is a much smaller job than programme design. */
const REQUEST_TIMEOUT_MS = 60_000

export function buildNotesPrompt(
  items: RecipeSuggestion[],
  target: NutritionTarget,
  input: OnboardingInput,
): string {
  const dishes = items
    .map(
      (r) =>
        `${r.id} | ${r.title} | ${r.kcal ?? '?'} kcal | ${r.proteinG ?? '?'} g protein`,
    )
    .join('\n')
  const trajectory = input.targetWeightKg
    ? `${input.weightKg} kg heading to ${input.targetWeightKg} kg`
    : `${input.weightKg} kg, no weight target`
  const budget =
    target.direction === 'maintain'
      ? `around ${target.kcalTarget} kcal a day to hold steady`
      : `${target.kcalTarget} kcal a day, a ${Math.abs(target.deltaKcal)} kcal ${target.direction} against maintenance`

  return `Order these dishes for one athlete and explain each briefly.

Athlete:
- Goal: ${GOAL_LABELS[input.goal]}. Currently ${trajectory}.
- Daily targets, already computed and not negotiable: ${budget}, at least ${target.proteinG} g protein.

Dishes (id | name | energy | protein):
${dishes}

Reply with ONE minified JSON object on a single line, nothing else, exactly this shape:
{"picks":[{"id":"...","note":"..."}]}
Rules: use ONLY the ids above, each at most once, best fit first. Each note is one plain sentence under 140 characters about how the dish serves this goal. No medical claims, no invented numbers, no hyphens used as dashes.`
}

interface RawPick {
  id?: unknown
  note?: unknown
}

/** Same discipline as validateBlocks: unknown ids vanish, notes get scrubbed. */
export function validatePicks(
  raw: unknown,
  items: RecipeSuggestion[],
): RecipeSuggestion[] | null {
  const picks = (raw as { picks?: unknown })?.picks
  if (!Array.isArray(picks) || picks.length === 0) return null
  const byId = new Map(items.map((r) => [r.id, r]))
  const seen = new Set<string>()

  const ordered: RecipeSuggestion[] = []
  for (const pick of picks as RawPick[]) {
    const id = typeof pick?.id === 'string' ? pick.id : undefined
    if (!id || !byId.has(id) || seen.has(id)) continue
    seen.add(id)
    const note =
      typeof pick.note === 'string'
        ? pick.note.replace(/[—–]/g, ',').replace(/\s+/g, ' ').trim().slice(0, 160)
        : undefined
    ordered.push({ ...byId.get(id)!, coachNote: note || undefined })
  }
  if (ordered.length === 0) return null

  // The model ranks; it does not filter. Anything it skipped trails behind.
  for (const r of items) if (!seen.has(r.id)) ordered.push(r)
  return ordered
}

/** Kill switch shared with the training coach: localStorage forma-coach=off. */
function coachSwitchedOff(): boolean {
  try {
    return localStorage.getItem('forma-coach') === 'off'
  } catch {
    return false
  }
}

/** Always resolves to a usable ordering; the coach is a bonus, not a gate. */
export async function annotateSuggestions(
  items: RecipeSuggestion[],
  target: NutritionTarget,
  input: OnboardingInput,
): Promise<RecipeSuggestion[]> {
  const fallback = rankSuggestions(items, target)
  if (!__AI_COACH__ || coachSwitchedOff() || items.length === 0) return fallback

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/minimax/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: __AI_COACH_MODEL__,
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content:
              'You are a pragmatic gym nutrition coach. You respond with a single JSON object and nothing else.',
          },
          { role: 'user', content: buildNotesPrompt(items, target, input) },
        ],
      }),
    })
    if (!res.ok) return fallback
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] }
    const content = data.choices?.[0]?.message?.content
    if (typeof content !== 'string') return fallback
    return validatePicks(extractJson(content), items) ?? fallback
  } catch {
    return fallback
  } finally {
    window.clearTimeout(timer)
  }
}
