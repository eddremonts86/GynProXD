/**
 * Scaling an ingredient line. The catalogue stores ingredients as the source
 * wrote them ("1/4 teaspoon cayenne pepper"), so cooking for a different
 * number of people means rewriting the amount at the front of each line.
 *
 * Only that leading amount is touched. A line with no number keeps its exact
 * words rather than being guessed at, which is the same rule the rest of this
 * feature follows: transform what the source actually measured, invent
 * nothing.
 */

const VULGAR: Record<string, number> = {
  '¼': 0.25,
  '½': 0.5,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
}

export interface LeadingQuantity {
  value: number
  rest: string
}

export function parseLeadingQuantity(line: string): LeadingQuantity | null {
  const text = line.trim()
  if (text.length === 0) return null

  /* "1 1/2 cups" — a whole number followed by a fraction. */
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)\s+(.*)$/)
  if (mixed) {
    const denominator = Number(mixed[3])
    if (denominator === 0) return null
    return { value: Number(mixed[1]) + Number(mixed[2]) / denominator, rest: mixed[4] }
  }

  /* "1½ cups" or "½ cup" — a vulgar fraction, with or without a whole part. */
  const vulgar = text.match(/^(\d*)\s*([¼½¾⅓⅔⅛⅜⅝⅞])\s+(.*)$/)
  if (vulgar) {
    const whole = vulgar[1] === '' ? 0 : Number(vulgar[1])
    return { value: whole + VULGAR[vulgar[2]], rest: vulgar[3] }
  }

  /* "3/4 teaspoon" */
  const fraction = text.match(/^(\d+)\/(\d+)\s+(.*)$/)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) return null
    return { value: Number(fraction[1]) / denominator, rest: fraction[3] }
  }

  /* "2 cups", "0.5 pound" */
  const plain = text.match(/^(\d+(?:\.\d+)?)\s+(.*)$/)
  if (plain) return { value: Number(plain[1]), rest: plain[2] }

  return null
}

/* The denominators a kitchen actually owns. */
const DENOMINATORS = [2, 3, 4, 8]

export function formatQuantity(value: number): string {
  const whole = Math.floor(value + 1e-9)
  const remainder = value - whole

  if (remainder < 0.01) return String(whole)

  for (const d of DENOMINATORS) {
    const numerator = Math.round(remainder * d)
    if (numerator > 0 && numerator < d && Math.abs(remainder - numerator / d) < 0.02) {
      const fraction = `${numerator}/${d}`
      return whole === 0 ? fraction : `${whole} ${fraction}`
    }
  }

  const rounded = Math.round(value * 10) / 10
  return String(rounded)
}

/* Units that read wrong un-pluralised once there is more than one of them. */
const UNITS = [
  'cup',
  'tablespoon',
  'teaspoon',
  'pound',
  'ounce',
  'can',
  'clove',
  'stalk',
  'slice',
  'package',
  'container',
  'bunch',
  'head',
  'pint',
  'quart',
  'gallon',
]

/**
 * Put the unit in the right number. The measured word is usually first
 * ("2 cups milk") but not always: "2 celery stalks" names the food first, so
 * the first two words are checked. Anything that is not a unit we recognise is
 * left exactly as the source wrote it.
 */
function matchPlurality(rest: string, value: number): string {
  const words = rest.match(/^([A-Za-z]+)(\s+)([A-Za-z]+)?/)
  if (!words) return rest

  const candidates: { word: string; start: number }[] = [{ word: words[1], start: 0 }]
  if (words[3]) {
    candidates.push({ word: words[3], start: words[1].length + words[2].length })
  }

  for (const { word, start } of candidates) {
    const singular = word.toLowerCase().replace(/s$/, '')
    if (!UNITS.includes(singular)) continue
    const wantsPlural = value > 1
    const isPlural = word.toLowerCase().endsWith('s')
    if (wantsPlural === isPlural) return rest
    const fixed = wantsPlural ? `${word}s` : word.replace(/s$/, '')
    return rest.slice(0, start) + fixed + rest.slice(start + word.length)
  }
  return rest
}

/** One ingredient line, rewritten for a different batch size. */
export function scaleIngredient(line: string, factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return line
  const parsed = parseLeadingQuantity(line)
  if (!parsed) return line
  const scaled = parsed.value * factor
  return `${formatQuantity(scaled)} ${matchPlurality(parsed.rest, scaled)}`
}
