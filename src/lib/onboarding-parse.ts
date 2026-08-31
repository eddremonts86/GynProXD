import type { DayOfWeek, OnboardingInput } from './types'

/**
 * How a field got its value, which the review step needs and a boolean cannot say.
 *
 * `quoted` was matched literally — the text said 92 kg and the field says 92 kg.
 * `inferred` was reasoned from something else: "gym" becoming a barbell pool,
 * "2 hours" becoming 120 minutes per session when it may well have meant two
 * hours a week. Both used to arrive looking identical, and the difference is the
 * whole story: on the placeholder this file ships with, two of the seven fields
 * are inferences and one of them is probably wrong.
 */
export type Provenance = 'quoted' | 'inferred'

export interface ParseResult {
  partial: Partial<OnboardingInput>
  provenance: Partial<Record<keyof OnboardingInput, Provenance>>
  confidence: number
  warnings: string[]
}

/**
 * Free-text intake. The vocabulary is bilingual on purpose: the UI is English
 * but the original users describe themselves in Spanish, and a box that
 * silently ignores half of what is typed into it is worse than no box.
 *
 * What this deliberately does NOT try to do is understand a sentence. It fills a
 * form instantly, offline, with no model behind it, so there is something on
 * screen to check while the coach thinks. Sequence, idiom and typos are the
 * coach's job, and the whole prose now reaches it as `constraints` — which is
 * the only channel able to carry an intention the form has no field for. See
 * docs/architecture/plan-intake.md.
 */

const GOAL_MAP: Array<[RegExp, OnboardingInput['goal']]> = [
  [/adelgazar|perder peso|bajar peso|definir|lose (?:fat|weight)|slim down|cut(?:ting)?\b/i, 'adelgazar'],
  [/ganar m[uú]sculo|hipertrofia|volumen|muscul|build muscle|hypertroph|bulk/i, 'musculo'],
  [/fuerza|powerlifting|strength|get strong|ponerme? fuerte|m[aá]s fuerte|coger fuerza/i, 'fuerza'],
  [/recomp|recompos/i, 'recomp'],
  [/h[ií]brido|mixto|hybrid/i, 'hibrido'],
]

const LEVEL_MAP: Array<[RegExp, OnboardingInput['level']]> = [
  [/principiante|novato|empezando|nuevo|beginner|novice|just start|new to/i, 'principiante'],
  [/intermedio|medio|intermediate/i, 'intermedio'],
  [/avanzado|experto|alto nivel|advanced|experienced/i, 'avanzado'],
]

/**
 * Order is the logic here, not decoration: the first pattern to match wins, so a
 * sentence mentioning both a place and its kit has to meet the kit first.
 *
 * "Entreno en casa, tengo mancuernas" used to answer `bodyweight` — the exact
 * opposite of what it says — because `casa` sat above any mention of equipment.
 *
 * `gy[mn]` is not a typo in this file. It is a typo in the sentences people
 * write, and `gyn` for `gym` costs the reader the entire second half of
 * "1 mes en casa y luego al gyn". A regex cannot be forgiving in general; it can
 * be forgiving about the one key people miss.
 */
const EQUIP_MAP: Array<[RegExp, OnboardingInput['equipment']]> = [
  [/h[ií]brido|hybrid|casa y (?:el )?g(?:ym|ymnasio|imnasio|yn)|gym and home/i, 'hibrido'],
  [/mancuerna|dumbell|dumbbell|pesas en casa/i, 'dumbbell'],
  [/calistenia|calisthenics|bodyweight|no equipment|sin material|peso corporal/i, 'bodyweight'],
  [/\bgy[mn]\b|gimnasio|barbell|weights|barra/i, 'barbell'],
  [/casa|home/i, 'bodyweight'],
]

/**
 * Effort in the words people actually use, rather than only the ones a form uses.
 *
 * Nobody types "esfuerzo: 4". They type "a tope" or "suave, que vuelvo de una
 * lesión". Without this the field fell to its default of 3, which happens to
 * read as "moderate" — so "a tope" and "con calma" produced the same programme
 * and both looked deliberate.
 */
const EFFORT_MAP: Array<[RegExp, OnboardingInput['effort']]> = [
  [/a tope|con todo|al m[aá]ximo|full send|all ?out|máxim[oa] intensidad/i, 5],
  /* No bare `fuerte`: in Spanish gym talk it means strong, not hard, so
     "quiero ponerme fuerte" is a goal and read as an intensity it was a
     false positive that set effort to 4 on a sentence about strength. */
  [/intenso|duro|hard\b|a saco/i, 4],
  [/moderad|medio|normal|steady|moderate/i, 3],
  [/tranquil|suave|con calma|ligero|easy|gentle|light\b/i, 2],
  [/muy suave|rehab|recuperaci[oó]n|volviendo de|coming back from/i, 1],
]

export function parseOnboarding(text: string): ParseResult {
  const t = text.toLowerCase()
  const warnings: string[] = []
  const partial: Partial<OnboardingInput> = {}
  const provenance: ParseResult['provenance'] = {}

  /** Records a value and how it was arrived at, so the two can never drift apart. */
  const set = <K extends keyof OnboardingInput>(
    key: K,
    value: OnboardingInput[K],
    how: Provenance,
  ) => {
    partial[key] = value
    provenance[key] = how
  }

  /**
   * The whole prose, kept verbatim.
   *
   * Not the residue the patterns failed to eat — all of it. A sentence like
   * "1 mes en casa moderado y luego al gym a tope" holds a *sequence*, and there
   * is no field for a "then": `OnboardingInput` has one equipment and one
   * effort. The coach can express it, because a block is four weeks and a
   * programme is a list of blocks, so the words have to arrive intact for it to
   * have anything to periodise from.
   */
  const prose = text.trim()
  if (prose) partial.constraints = prose

  /**
   * The clause about a body part that hurts, lifted out of the prose.
   *
   * It is in `constraints` too — everything is — but this is the one input with a
   * safety consequence, and a prompt that can point at a field says something
   * different from one that says "read the paragraph". Deliberately greedy about
   * what counts as a mention and deliberately shy about interpreting it: the
   * clause travels as written, and the coach decides what it means.
   */
  const hurtM = text.match(
    /[^.;\n]*\b(?:cuidado con|lesi[oó]n|lesionad|me duele|duele|molestia|hernia|tendinitis|operad|injur|pain|bad (?:knee|back|shoulder|hip)|careful with|recovering from)\b[^.;\n]*/i,
  )
  if (hurtM) {
    const clause = hurtM[0].trim().replace(/^[,\s]+/, '')
    if (clause.length > 3) set('limitations', clause.slice(0, 200), 'quoted')
  }

  /**
   * Named weekdays, when somebody says which ones rather than how many.
   *
   * `daysPerWeek` is set from this too, and takes precedence over any count in
   * the sentence: "lunes, miércoles y viernes" is three days stated more
   * precisely than "3 días", so letting a stray digit elsewhere overwrite it
   * would be losing information to a weaker signal.
   */
  const DAY_WORDS: Array<[RegExp, DayOfWeek]> = [
    [/\blunes\b|\bmondays?\b|\bmon\b/i, 'mon'],
    [/\bmartes\b|\btuesdays?\b|\btue\b/i, 'tue'],
    [/\bmi[eé]rcoles\b|\bwednesdays?\b|\bwed\b/i, 'wed'],
    [/\bjueves\b|\bthursdays?\b|\bthu\b/i, 'thu'],
    [/\bviernes\b|\bfridays?\b|\bfri\b/i, 'fri'],
    [/\bs[aá]bado\b|\bsaturdays?\b|\bsat\b/i, 'sat'],
    [/\bdomingo\b|\bsundays?\b|\bsun\b/i, 'sun'],
  ]
  const named = DAY_WORDS.filter(([re]) => re.test(t)).map(([, d]) => d)
  if (named.length > 0) {
    set('trainingDays', named, 'quoted')
    set('daysPerWeek', named.length, 'quoted')
  }

  const ageM =
    t.match(/(\d{1,2})\s*(?:a[ñn]os|a[ñn]o)\b/i) ??
    t.match(/(\d{1,2})\s*(?:years?(?:\s+old)?|yo|yrs?)\b/i) ??
    t.match(/\bage[:\s]+(\d{1,2})\b/i)
  if (ageM) set('age', clampInt(Number(ageM[1]), 12, 80), 'quoted')

  if (/hombre|chico|var[oó]n|\bmale\b|\bman\b|\bguy\b/i.test(t)) set('sex', 'hombre', 'quoted')
  else if (/mujer|chica|\bfemale\b|\bwoman\b/i.test(t)) set('sex', 'mujer', 'quoted')
  else if (/otro|no binario|non[- ]?binary/i.test(t)) set('sex', 'otro', 'quoted')

  /* `kilos` and `kilo` as well as `kg`: "peso 92 kilos" is how the sentence is
     actually written, and it used to yield nothing — so a 92 kg athlete had a
     programme paced from the 75 kg default with no sign anything was missing. */
  const weightMatches = [...t.matchAll(/(\d{2,3})\s*(?:kg|kilos?)\b/g)].map((m) => Number(m[1]))
  if (weightMatches.length >= 2) {
    /* Two weights in one sentence is nearly always "from A to B", and the order
       people write is current first. An inference, and marked as one. */
    set('weightKg', weightMatches[0], 'quoted')
    set('targetWeightKg', weightMatches[1], 'inferred')
  } else if (weightMatches.length === 1) {
    set('weightKg', weightMatches[0], 'quoted')
  }

  const targetM =
    t.match(/(?:a|hasta|objetivo|meta)\s*(\d{2,3})\s*kg/i) ??
    t.match(/(?:to|down to|target|goal(?:\s+weight)?(?:\s+of)?)\s*(\d{2,3})\s*kg/i) ??
    t.match(/(?:→|->)\s*(\d{2,3})\s*kg/i)
  if (targetM) set('targetWeightKg', Number(targetM[1]), 'quoted')

  const heightM = t.match(/(\d{2,3})\s*cm/i) ?? t.match(/(\d\.\d{1,2})\s*m\b/i)
  if (heightM) {
    const raw = Number(heightM[1])
    set('heightCm', raw < 3 ? Math.round(raw * 100) : raw, 'quoted')
  }

  for (const [re, v] of GOAL_MAP)
    if (re.test(t)) {
      set('goal', v, 'quoted')
      break
    }
  /* Read off the two weights rather than off any word, so it is an inference. */
  if (!partial.goal && partial.targetWeightKg !== undefined && partial.weightKg !== undefined) {
    if (partial.targetWeightKg < partial.weightKg) set('goal', 'adelgazar', 'inferred')
    else if (partial.targetWeightKg > partial.weightKg) set('goal', 'musculo', 'inferred')
  }

  for (const [re, v] of LEVEL_MAP)
    if (re.test(t)) {
      set('level', v, 'quoted')
      break
    }

  /**
   * Two places in one sentence means both places, not whichever pattern sits
   * higher in the list.
   *
   * "1 mes en casa y luego al gyn" answered `barbell` — the gym half won on list
   * order and the home half vanished, which is the wrong half to lose when it is
   * the one you start in. `hibrido` permits both pools, so the coach can put a
   * home block first and gym blocks after: the honest scalar for a sentence with
   * a "then" in it is the union, not a coin flip.
   *
   * A place is never `quoted`. "gym" is a word about a building; turning it into
   * a set of allowed movement ids is a decision this file made.
   */
  const saysHome = /\bcasa\b|\bhome\b|calistenia|calisthenics|peso corporal|sin material/i.test(t)
  const saysGym = /\bgy[mn]\b|gimnasio|barbell|barra|weights/i.test(t)
  if (saysHome && saysGym) {
    set('equipment', 'hibrido', 'inferred')
  } else {
    for (const [re, v] of EQUIP_MAP)
      if (re.test(t)) {
        set('equipment', v, 'inferred')
        break
      }
  }

  /**
   * Earliest mention wins, not the strongest.
   *
   * "moderada y ya luego a darle con todo" used to answer 5, because `a tope`
   * sits at the top of the map. But the scalar describes where the programme
   * *starts*, and this member starts moderate. The climb is a sequence, it lives
   * in the prose, and the coach is the thing that can read it.
   */
  const effortHit = EFFORT_MAP.map(([re, v]) => [t.search(re), v] as const)
    .filter(([at]) => at >= 0)
    .sort((a, b) => a[0] - b[0])[0]
  if (effortHit) set('effort', effortHit[1], 'inferred')

  const daysM =
    t.match(/(\d)\s*(?:veces|x)\s*(?:a la semana|por semana|semana|\/?\s*(?:a\s*)?week|weekly)?/i) ??
    t.match(/(\d)\s*(?:d[ií]as|days)/i) ??
    t.match(/(\d)\s*times?\s*(?:a|per)\s*week/i)
  if (daysM && !partial.trainingDays) set('daysPerWeek', clampInt(Number(daysM[1]), 1, 6), 'quoted')

  const hoursM = t.match(/(\d+(?:[.,]\d+)?)\s*(?:h\b|hours?|hrs?\b)/i)
  const minsM = t.match(/(\d+)\s*(?:min|minutes?)/i)
  if (hoursM) {
    /* "3 times a week for 2 hours" is ambiguous in the sentence and unambiguous
       in the field: this reads it as per session, which on that very example is
       probably wrong. Marked inferred so the review step puts it in front of the
       member rather than filing it as something they said. */
    set(
      'minsPerSession',
      clampInt(Math.round(Number(hoursM[1].replace(',', '.')) * 60), 30, 120),
      'inferred',
    )
    warnings.push('Read "hours" as minutes per session. Change it below if you meant per week.')
  } else if (minsM) {
    set('minsPerSession', clampInt(Number(minsM[1]), 30, 120), 'quoted')
  }

  /* An explicit "esfuerzo: alto" outranks the idiom map above, so it runs after
     and overwrites — someone who names a number means the number. */
  const effortM = t.match(/(?:esfuerzo|effort|intensity)\s*[:=]?\s*(bajo|medio|alto|low|medium|high|\d)/i)
  if (effortM) {
    const v = effortM[1].toLowerCase()
    if (v === 'bajo' || v === 'low' || v === '1') set('effort', 1, 'quoted')
    else if (v === 'medio' || v === 'medium' || v === '2' || v === '3') set('effort', 3, 'quoted')
    else if (v === 'alto' || v === 'high' || v === '4' || v === '5') set('effort', 5, 'quoted')
    else if (/\d/.test(v))
      set('effort', clampInt(Number(v), 1, 5) as OnboardingInput['effort'], 'quoted')
  }

  /**
   * Confidence measures how much of this was *read*, not how much was filled in.
   *
   * It used to be `found / fields` — pure coverage — and on the placeholder this
   * file ships with it returned **1.0** while reading two hours a session out of
   * an ambiguous sentence and a barbell pool out of the word "gym". A number that
   * says "certain" while guessing is worse than no number, because it is the one
   * thing a reader would use to decide whether to look.
   *
   * An inference is worth half a quote. Nothing is worth nothing.
   */
  const fields: (keyof OnboardingInput)[] = [
    'age',
    'weightKg',
    'goal',
    'daysPerWeek',
    'minsPerSession',
    'equipment',
  ]
  const credit = fields.reduce((sum, f) => {
    if (partial[f] === undefined) return sum
    return sum + (provenance[f] === 'inferred' ? 0.5 : 1)
  }, 0)
  const confidence = Math.round((credit / fields.length) * 100) / 100

  if (partial.weightKg && partial.targetWeightKg && partial.weightKg === partial.targetWeightKg) {
    warnings.push('Your target weight matches your current weight.')
  }
  if (partial.age && (partial.age < 16 || partial.age > 75)) {
    warnings.push('That age is outside the range these estimates were built for.')
  }

  /* A sentence with a "then" in it describes two programmes, and this parser can
     only fill one form. Said out loud rather than silently flattened, because the
     coach *can* act on it and the member should know that is what will happen. */
  if (/luego|despu[eé]s|m[aá]s adelante|then|after that|first month|primer mes|1 ?mes/i.test(t)) {
    warnings.push(
      'This reads like a plan that changes over time. The fields below hold one setting each; your words go to the coach, which can phase the blocks.',
    )
  }

  return { partial, provenance, confidence, warnings }
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function mergeWithDefaults(partial: Partial<OnboardingInput>): OnboardingInput {
  return {
    age: partial.age ?? 30,
    sex: partial.sex ?? 'otro',
    weightKg: partial.weightKg ?? 75,
    targetWeightKg: partial.targetWeightKg,
    heightCm: partial.heightCm ?? 175,
    goal: partial.goal ?? 'general',
    level: partial.level ?? 'principiante',
    daysPerWeek: partial.daysPerWeek ?? 3,
    minsPerSession: partial.minsPerSession ?? 60,
    equipment: (partial.equipment as OnboardingInput['equipment']) ?? 'hibrido',
    effort: (partial.effort as OnboardingInput['effort']) ?? 3,
    trainingDays: partial.trainingDays,
    limitations: partial.limitations,
    avoid: partial.avoid,
    constraints: partial.constraints,
  }
}
