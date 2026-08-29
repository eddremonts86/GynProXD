/**
 * What the admin form holds while it is being filled in, and what is wrong
 * with it. Kept as strings because that is what inputs give back; the server
 * validates all of this again on arrival (pb_hooks/utils/recipe_validate.js),
 * so this exists to say what is missing before the round trip, not instead
 * of it.
 */

export const CATEGORY_KEYS = [
  'main',
  'breakfast',
  'salad',
  'soup',
  'side',
  'dessert',
  'drink',
  'snack',
  'other',
] as const

export interface RecipeDraft {
  id: string | null
  title: string
  category: string
  kcal: string
  proteinG: string
  servings: string
  readyInMinutes: string
  ingredients: string
  directions: string
  /** True when the record already carries a photo, so a new file is optional. */
  hasImage: boolean
}

export function blankDraft(): RecipeDraft {
  return {
    id: null,
    title: '',
    category: 'main',
    kcal: '',
    proteinG: '',
    servings: '',
    readyInMinutes: '',
    ingredients: '',
    directions: '',
    hasImage: false,
  }
}

function asLines(value: unknown): string {
  if (Array.isArray(value)) return value.filter((s) => typeof s === 'string').join('\n')
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string').join('\n')
    } catch {
      /* Not JSON: treat it as the text it is. */
    }
    return value
  }
  return ''
}

export function draftFromRecord(row: {
  id: string
  title: string
  category: string
  kcal: number
  proteinG: number
  servings: number
  readyInMinutes: number
  image: string
  imageUrl: string
  ingredients: unknown
  directions: unknown
}): RecipeDraft {
  const num = (n: number) => (typeof n === 'number' && n > 0 ? String(n) : '')
  return {
    id: row.id,
    title: row.title ?? '',
    category: CATEGORY_KEYS.includes(row.category as (typeof CATEGORY_KEYS)[number])
      ? row.category
      : 'other',
    kcal: num(row.kcal),
    proteinG: num(row.proteinG),
    servings: num(row.servings),
    readyInMinutes: num(row.readyInMinutes),
    ingredients: asLines(row.ingredients),
    directions: asLines(row.directions),
    hasImage: Boolean(row.image) || Boolean(row.imageUrl),
  }
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
}

function positive(value: string, max: number): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= max
}

/** Field name to the reason it is not acceptable yet. Empty means ready. */
export function draftProblems(
  draft: RecipeDraft,
  hasNewFile: boolean,
): Partial<Record<keyof RecipeDraft | 'image', string>> {
  const problems: Partial<Record<keyof RecipeDraft | 'image', string>> = {}
  if (draft.title.trim().length < 2) problems.title = 'Give the dish a name.'
  if (!CATEGORY_KEYS.includes(draft.category as (typeof CATEGORY_KEYS)[number])) {
    problems.category = 'Pick a course.'
  }
  if (!positive(draft.kcal, 5000)) problems.kcal = 'Energy per serving, above zero.'
  if (!positive(draft.proteinG, 500)) problems.proteinG = 'Protein per serving, above zero.'
  if (!positive(draft.servings, 100)) problems.servings = 'How many servings it makes.'
  if (draft.readyInMinutes.trim() !== '' && !positive(draft.readyInMinutes, 1440)) {
    problems.readyInMinutes = 'Minutes, above zero.'
  }
  if (lines(draft.ingredients).length < 1) problems.ingredients = 'At least one ingredient.'
  if (lines(draft.directions).length < 2) problems.directions = 'At least two steps.'
  if (!draft.hasImage && !hasNewFile) problems.image = 'A photo is required.'
  return problems
}
