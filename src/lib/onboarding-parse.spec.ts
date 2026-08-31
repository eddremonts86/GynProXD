import { describe, expect, it } from 'vitest'
import { mergeWithDefaults, parseOnboarding } from './onboarding-parse'

describe('parseOnboarding', () => {
  it('parses example 140->80 3x2h', () => {
    const text = 'soy un hombre de 40 anos que solo puedo ir al gymnacio 3 veces a la semana durante 2h al dia. Peso 140kg y quiero adelgazar a 80kg'
    const { partial, confidence } = parseOnboarding(text)
    expect(partial.sex).toBe('hombre')
    expect(partial.age).toBe(40)
    expect(partial.weightKg).toBe(140)
    expect(partial.targetWeightKg).toBe(80)
    expect(partial.goal).toBe('adelgazar')
    expect(partial.daysPerWeek).toBe(3)
    expect(partial.minsPerSession).toBe(120)
    expect(confidence).toBeGreaterThan(0.5)
    const merged = mergeWithDefaults(partial)
    expect(merged.effort).toBe(3)
    expect(merged.level).toBe('principiante')
  })

  it('parses chica 25 adelgazar', () => {
    const { partial } = parseOnboarding('mujer 25 años 65kg objetivo 58kg gym 4 veces 60min esfuerzo alto')
    expect(partial.sex).toBe('mujer')
    expect(partial.goal).toBe('adelgazar')
    expect(partial.daysPerWeek).toBe(4)
    expect(partial.minsPerSession).toBe(60)
    expect(partial.effort).toBe(5)
  })

  it('parses an English description', () => {
    const { partial, confidence } = parseOnboarding(
      'male, 40 years old, 140kg and want to get down to 80kg, gym 3 times a week for 2h, effort medium',
    )
    expect(partial.sex).toBe('hombre')
    expect(partial.age).toBe(40)
    expect(partial.weightKg).toBe(140)
    expect(partial.targetWeightKg).toBe(80)
    expect(partial.goal).toBe('adelgazar')
    expect(partial.equipment).toBe('barbell')
    expect(partial.daysPerWeek).toBe(3)
    expect(partial.minsPerSession).toBe(120)
    expect(partial.effort).toBe(3)
    expect(confidence).toBeGreaterThan(0.5)
  })

  it('parses bare "years" without "old"', () => {
    const { partial } = parseOnboarding('male 40 years 120kg target 90kg gym 4 times a week 60min')
    expect(partial.age).toBe(40)
    expect(partial.targetWeightKg).toBe(90)
  })

  it('parses English bodyweight and beginner wording', () => {
    const { partial } = parseOnboarding(
      'beginner woman, 65kg, calisthenics at home, 4 days a week, 45 minutes, build muscle',
    )
    expect(partial.sex).toBe('mujer')
    expect(partial.level).toBe('principiante')
    expect(partial.equipment).toBe('bodyweight')
    expect(partial.goal).toBe('musculo')
    expect(partial.daysPerWeek).toBe(4)
    expect(partial.minsPerSession).toBe(45)
  })

  it('defaults when empty', () => {
    const { partial } = parseOnboarding('')
    const merged = mergeWithDefaults(partial)
    expect(merged.weightKg).toBe(75)
    expect(merged.goal).toBe('general')
  })
})

/**
 * The cases that made this file worth changing.
 *
 * Every one of them is a sentence a member actually wrote, or the placeholder the
 * app itself puts in the box, and every one of them used to be read wrong or not
 * read at all.
 */
describe('what the box used to lose', () => {
  it('carries the whole prose so the coach can read what no field holds', () => {
    const text = 'un mes en casa moderado y luego al gym a tope'
    expect(parseOnboarding(text).partial.constraints).toBe(text)
    // Not the residue, the lot: the sequence is in the shape of the sentence,
    // not in the words the patterns failed to eat.
    expect(mergeWithDefaults(parseOnboarding(text).partial).constraints).toBe(text)
  })

  it('reads kilos, not only kg', () => {
    // "peso 92 kilos" yielded nothing, so the plan paced from the 75 kg default.
    expect(parseOnboarding('peso 92 kilos').partial.weightKg).toBe(92)
  })

  it('reads "ponerme fuerte" as the goal it is', () => {
    const r = parseOnboarding('quiero ponerme fuerte')
    expect(r.partial.goal).toBe('fuerza')
    // And not as an intensity. `fuerte` is strong, not hard.
    expect(r.partial.effort).toBeUndefined()
  })

  it('does not lose half a sentence to one mistyped letter', () => {
    // `gyn` for `gym` used to match nothing, taking the gym half of the plan with it.
    expect(parseOnboarding('voy al gyn 4 dias').partial.equipment).toBe('barbell')
  })

  it('believes the equipment someone says they own over the room they are in', () => {
    // "en casa, tengo mancuernas" answered bodyweight — the opposite of the words.
    expect(parseOnboarding('entreno en casa, tengo mancuernas').partial.equipment).toBe('dumbbell')
  })

  it('reads two places as both places, not as whichever pattern sits higher', () => {
    expect(parseOnboarding('1 mes en casa y luego al gyn').partial.equipment).toBe('hibrido')
  })

  it('takes the effort the programme starts at, not the loudest one in the sentence', () => {
    // "moderada ... y ya luego a darle con todo" starts moderate. The climb is a
    // sequence and belongs to the coach.
    expect(parseOnboarding('de manera moderada y ya luego a darle con todo').partial.effort).toBe(3)
  })

  it('reads effort from idiom, since nobody types "esfuerzo: 4"', () => {
    expect(parseOnboarding('quiero darle a tope').partial.effort).toBe(5)
    expect(parseOnboarding('prefiero ir suave').partial.effort).toBe(2)
  })

  it('says out loud that a sentence describes a plan which changes', () => {
    const r = parseOnboarding('un mes en casa y luego al gimnasio')
    expect(r.warnings.some((w) => /changes over time/i.test(w))).toBe(true)
  })
})

describe('confidence stops claiming certainty it does not have', () => {
  it('does not return 1.0 for a sentence it half guessed', () => {
    // The app's own placeholder. This returned exactly 1.0 while reading two
    // hours as per-session and a barbell pool out of the word "gym".
    const r = parseOnboarding('40 years old, 140kg, want to get down to 80kg, gym 3 times a week for 2 hours')
    expect(r.confidence).toBeLessThan(1)
    expect(r.provenance.minsPerSession).toBe('inferred')
    expect(r.provenance.equipment).toBe('inferred')
    expect(r.provenance.age).toBe('quoted')
  })

  it('flags the hours reading rather than filing it as something they said', () => {
    const r = parseOnboarding('gym 3 times a week for 2 hours')
    expect(r.warnings.some((w) => /per session/i.test(w))).toBe(true)
  })

  it('scores an inference at half a quote', () => {
    // One quoted field of six, nothing else.
    expect(parseOnboarding('tengo 30 años').confidence).toBeCloseTo(1 / 6, 2)
    // One inferred field of six.
    expect(parseOnboarding('entreno en el gimnasio').confidence).toBeCloseTo(0.5 / 6, 2)
  })
})

describe('the inputs a programme could not previously be told about', () => {
  it('lifts the clause about what hurts out of the prose', () => {
    const r = parseOnboarding('entreno 4 dias. Cuidado con la rodilla izquierda, me duele al bajar.')
    expect(r.partial.limitations).toMatch(/rodilla izquierda/i)
  })

  it('leaves limitations alone when nothing hurts', () => {
    expect(parseOnboarding('quiero adelgazar, 3 dias').partial.limitations).toBeUndefined()
  })

  it('reads which days, not only how many', () => {
    const r = parseOnboarding('entreno lunes, miercoles y viernes')
    expect(r.partial.trainingDays).toEqual(['mon', 'wed', 'fri'])
    expect(r.partial.daysPerWeek).toBe(3)
  })

  it('lets named days outrank a looser count in the same sentence', () => {
    // "2 horas" holds a digit the day pattern could otherwise swallow; the named
    // days are the stronger statement and must survive it.
    const r = parseOnboarding('lunes y jueves, 2 horas cada uno')
    expect(r.partial.trainingDays).toEqual(['mon', 'thu'])
    expect(r.partial.daysPerWeek).toBe(2)
  })

  it('reads English day names too', () => {
    expect(parseOnboarding('I train tuesday and saturday').partial.trainingDays).toEqual(['tue', 'sat'])
  })
})

describe('height said in words', () => {
  it('reads the verb, not just the unit', () => {
    expect(parseOnboarding('Tengo 34 anos y mido 178').partial.heightCm).toBe(178)
    expect(parseOnboarding('mide 1,78 y pesa 92 kilos').partial.heightCm).toBe(178)
    expect(parseOnboarding("I'm 180 cm").partial.heightCm).toBe(180)
    expect(parseOnboarding('estatura 165').partial.heightCm).toBe(165)
  })

  it('marks it quoted, so the review step does not call it a guess', () => {
    expect(parseOnboarding('mido 178').provenance.heightCm).toBe('quoted')
  })

  it('leaves a bare number alone', () => {
    // No verb, no unit. 178 here is a postcode, a weight in pounds, anything.
    expect(parseOnboarding('entreno en el gimnasio 178 de la calle mayor').partial.heightCm)
      .toBeUndefined()
  })

  it('refuses a number that cannot be a height', () => {
    expect(parseOnboarding('mido 450').partial.heightCm).toBeUndefined()
  })
})
