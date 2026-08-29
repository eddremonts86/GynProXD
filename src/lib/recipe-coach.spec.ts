import { describe, expect, it } from 'vitest'
import { buildNotesPrompt, validatePicks } from './recipe-coach'
import { nutritionTargetFor } from './nutrition-target'
import type { RecipeSuggestion } from './recipes'
import type { OnboardingInput } from './types'

const input: OnboardingInput = {
  age: 30,
  sex: 'hombre',
  weightKg: 90,
  targetWeightKg: 80,
  heightCm: 180,
  goal: 'adelgazar',
  level: 'intermedio',
  daysPerWeek: 4,
  minsPerSession: 60,
  equipment: 'hibrido',
  effort: 3,
}

const items: RecipeSuggestion[] = [
  { id: 'a', provider: 'fatsecret', title: 'Chicken bowl', imageUrl: 'https://x/a.jpg', kcal: 550, proteinG: 52 },
  { id: 'b', provider: 'fatsecret', title: 'Salmon plate', imageUrl: 'https://x/b.jpg', kcal: 620, proteinG: 45 },
  { id: 'c', provider: 'fatsecret', title: 'Lentil stew', imageUrl: 'https://x/c.jpg', kcal: 480, proteinG: 28 },
]

describe('buildNotesPrompt', () => {
  it('states the trajectory and the fixed targets', () => {
    const prompt = buildNotesPrompt(items, nutritionTargetFor(input), input)
    expect(prompt).toContain('90 kg heading to 80 kg')
    expect(prompt).toContain('deficit')
    expect(prompt).toContain('180 g protein')
    expect(prompt).toContain('a | Chicken bowl | 550 kcal | 52 g protein')
  })
})

describe('validatePicks', () => {
  it('reorders by the model and keeps its notes', () => {
    const picked = validatePicks(
      { picks: [{ id: 'b', note: 'Big protein hit.' }, { id: 'a', note: 'Lean and filling.' }] },
      items,
    )
    expect(picked?.map((r) => r.id)).toEqual(['b', 'a', 'c'])
    expect(picked?.[0].coachNote).toBe('Big protein hit.')
    // 'c' was skipped by the model, so it trails without a note.
    expect(picked?.[2].coachNote).toBeUndefined()
  })

  it('drops hallucinated ids and duplicates', () => {
    const picked = validatePicks(
      { picks: [{ id: 'ghost' }, { id: 'a', note: 'x' }, { id: 'a', note: 'again' }] },
      items,
    )
    expect(picked?.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('scrubs dashes and caps note length', () => {
    const picked = validatePicks(
      { picks: [{ id: 'a', note: `high — protein  ${'x'.repeat(400)}` }] },
      items,
    )
    expect(picked?.[0].coachNote).not.toContain('—')
    expect(picked?.[0].coachNote!.length).toBeLessThanOrEqual(160)
  })

  it('returns null when nothing valid survives', () => {
    expect(validatePicks({ picks: [{ id: 'ghost' }] }, items)).toBeNull()
    expect(validatePicks({}, items)).toBeNull()
    expect(validatePicks(null, items)).toBeNull()
  })
})
