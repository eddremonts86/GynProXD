/**
 * Reading the shape of a cooking step. The catalogue stores directions as
 * plain sentences, so the recipe page derives its icon and its timer from the
 * words themselves. This is deliberately a small keyword table, in the same
 * spirit as the category rules in the import script: when nothing matches the
 * step stays plain rather than being labelled with a guess.
 */

export type StepKind =
  | 'wash'
  | 'cut'
  | 'bake'
  | 'heat'
  | 'mix'
  | 'chill'
  | 'drain'
  | 'serve'
  | 'plain'

/* Ordered: the first match wins, so the specific beats the generic. "Preheat
   oven" is a baking step even though it says heat, and the hand-washing line
   these recipes open with beats the chopping that follows it. */
const RULES: [StepKind, RegExp][] = [
  ['wash', /\b(wash|rinse|scrub|clean)\b/i],
  ['bake', /\b(bake|baking|oven|roast|broil|preheat)\b/i],
  ['chill', /\b(refrigerat\w*|chill|freeze|frozen|cool completely|ice)\b/i],
  ['cut', /\b(chop|slice|dice|mince|cut|peel|shred|grate|trim)\b/i],
  ['heat', /\b(heat|cook|fry|saut\w*|brown|boil|simmer|steam|grill|microwave|warm)\b/i],
  ['drain', /\b(drain|strain)\b/i],
  ['mix', /\b(mix|stir|combine|whisk|blend|toss|fold|beat|mash)\b/i],
  ['serve', /\b(serve|garnish|top with|plate|enjoy)\b/i],
]

export function stepKind(text: string): StepKind {
  for (const [kind, pattern] of RULES) if (pattern.test(text)) return kind
  return 'plain'
}

/**
 * The longest time the step names, in minutes — "3-5 minutes" is five, since
 * that is when the cook should look again. Temperatures are not times, so a
 * step that only mentions degrees gets no timer, and neither does a
 * food-safety deadline: "refrigerate within 2 hours" is a limit to respect,
 * not a stretch of cooking to count down.
 */
export function stepMinutes(text: string): number | undefined {
  if (/\bwithin\b/i.test(text)) return undefined
  let longest: number | undefined
  const pattern = /(\d+)\s*(?:(?:to|-|–|—|or)\s*(\d+)\s*)?(minutes?|mins?|hours?|hrs?)\b/gi
  for (const match of text.matchAll(pattern)) {
    const unit = match[3].toLowerCase()
    const value = Number(match[2] ?? match[1])
    if (!Number.isFinite(value)) continue
    const minutes = unit.startsWith('h') ? value * 60 : value
    if (longest === undefined || minutes > longest) longest = minutes
  }
  return longest
}
