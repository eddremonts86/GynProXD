import { describe, expect, it } from 'vitest'
import { alreadyThere, parseAnchors, validateProposal } from './anchor-parse'
import type { Anchor } from './life-profile'

/**
 * The companion's deterministic half, which is the half that always runs.
 *
 * Every case here is about the difference between what somebody wrote and what
 * was worked out from it, because that difference is what the review step
 * shows and what makes proposing anything acceptable at all. A parser that
 * marked its guesses as quotes would be writing invented hours into somebody's
 * week under a label that says they said it.
 */
const shape = (text: string) =>
  parseAnchors(text).map((p) => `${p.label}|${p.start}-${p.end}|${p.days.join(',')}|${p.kind}`)

describe('a span in words', () => {
  it('reads the twenty-four hour form as written', () => {
    expect(shape('work 09:00 to 17:00')).toEqual(['work|09:00-17:00|mon,tue,wed,thu,fri|work'])
  })

  it('reads a meridiem', () => {
    expect(shape('work 9am to 6pm')).toEqual(['work|09:00-18:00|mon,tue,wed,thu,fri|work'])
    expect(shape('work 8am to 12pm')).toEqual(['work|08:00-12:00|mon,tue,wed,thu,fri|work'])
  })

  it('reads the Spanish it is likely to be given', () => {
    expect(shape('trabajo de 9 a 5')).toEqual(['trabajo|09:00-17:00|mon,tue,wed,thu,fri|work'])
  })
})

describe('the two inferences, and where they stop', () => {
  it('adds twelve hours to "9 to 5", because nobody means five in the morning', () => {
    const [work] = parseAnchors('work 9 to 5')
    expect([work.start, work.end]).toEqual(['09:00', '17:00'])
    expect(work.start_from).toBe('quoted')
    expect(work.end_from).toBe('inferred')
  })

  it('does not do it when the text named the hours itself', () => {
    // "11pm to 6am" is a night shift somebody described precisely. Turning it
    // into an eighteen hour day would be inventing a week nobody has.
    expect(parseAnchors('shift 11pm to 6am')).toEqual([])
  })

  it('turns a single time into half an hour, and says so', () => {
    const [run] = parseAnchors('school run at 8:30')
    expect([run.start, run.end]).toEqual(['08:30', '09:00'])
    expect(run.end_from).toBe('inferred')
    expect(run.kind).toBe('care')
  })

  it('guesses weekdays and marks the guess', () => {
    const [work] = parseAnchors('work 09:00 to 17:00')
    expect(work.days_from).toBe('inferred')
  })

  it('quotes the days when the text names them', () => {
    const [work] = parseAnchors('work Mondays and Wednesdays 09:00 to 17:00')
    /* The clause splits on "and", so the days ride on whichever half has the
       times; what matters is that a named day is never marked as a guess. */
    expect(work.days_from).toBe('quoted')
  })

  it('reads the phrases people actually use for a set of days', () => {
    expect(parseAnchors('gym weekends 10:00 to 11:30')[0].days).toEqual(['sat', 'sun'])
    expect(parseAnchors('trabajo entre semana 09:00 a 17:00')[0].days).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
    ])
    expect(parseAnchors('commute every day 08:00 to 08:45')[0].days).toHaveLength(7)
  })
})

describe('what it refuses to guess at', () => {
  it('drops a clause with no time in it', () => {
    expect(parseAnchors('I would like to feel better')).toEqual([])
    expect(parseAnchors('')).toEqual([])
  })

  it('does not read a count as a clock', () => {
    // "3 times a week" is the sentence this app's other intake is full of. One
    // bare number with no colon and no meridiem is not an hour.
    expect(parseAnchors('I train 3 times a week')).toEqual([])
    expect(parseAnchors('two kids')).toEqual([])
  })

  it('drops an impossible clock rather than clamping it', () => {
    expect(parseAnchors('work 25:00 to 26:00')).toEqual([])
    expect(parseAnchors('work 09:70 to 17:00')).toEqual([])
  })

  it('refuses a span that cannot be made to run forwards', () => {
    expect(parseAnchors('work 17:00 to 09:00')).toEqual([])
  })

  it('takes the verb that got to the time out of the label', () => {
    // Both of these shipped once and read badly on the screen somebody opens
    // every morning: "school run is" and "get train home".
    expect(parseAnchors('the school run is at 08:15')[0].label).toBe('school run')
    expect(parseAnchors('I get the train home 17:30 to 18:15')[0].label).toBe('train home')
    expect(parseAnchors('I do yoga 18:00 to 19:00')[0].label).toBe('yoga')
  })

  it('keeps a word that could be the name of the thing', () => {
    // `train` survives, `get` does not. A filler list that ate nouns would be
    // worse than one that leaves the odd verb behind.
    expect(parseAnchors('train 17:30 to 18:15')[0].label).toBe('train')
  })

  it('never leaves an anchor with no name', () => {
    // A clause that is nothing but a time still has to be labelled something,
    // because the day draws the label and an empty row is unreadable.
    expect(parseAnchors('09:00 to 17:00')[0].label).toBe('Busy')
  })
})

describe('more than one thought in a breath', () => {
  it('splits on the punctuation and conjunctions people use', () => {
    expect(shape('I work 09:00 to 17:00, school run at 08:15')).toEqual([
      'work|09:00-17:00|mon,tue,wed,thu,fri|work',
      'school run|08:15-08:45|mon,tue,wed,thu,fri|care',
    ])
  })

  it('reads the kind from the words around the time', () => {
    const kinds = parseAnchors(
      'work 09:00 to 17:00\ncommute 08:00 to 08:45\npick up the kids at 16:30\nchoir 19:00 to 20:00',
    ).map((p) => p.kind)
    expect(kinds).toEqual(['work', 'travel', 'care', 'fixed'])
  })
})

describe('validateProposal', () => {
  const good = {
    label: 'work',
    days: ['mon'],
    start: '09:00',
    end: '17:00',
    kind: 'work',
    clause: 'work 9 to 5',
    start_from: 'quoted',
    end_from: 'inferred',
    days_from: 'inferred',
  }

  it('passes something the parser would have produced', () => {
    expect(validateProposal(good)).toMatchObject({ label: 'work', start: '09:00', end: '17:00' })
  })

  it('is the same gate for a model as for the regex', () => {
    // The point of it existing. A hallucinated hour must not reach the profile
    // through a route the deterministic path does not have, which is the
    // arrangement `validateBlocks` uses in ai-plan.ts.
    expect(validateProposal({ ...good, start: 'lunchtime' })).toBeNull()
    expect(validateProposal({ ...good, end: '09:00' })).toBeNull()
    expect(validateProposal({ ...good, days: [] })).toBeNull()
    expect(validateProposal({ ...good, days: ['someday'] })).toBeNull()
    expect(validateProposal({ ...good, label: '   ' })).toBeNull()
    expect(validateProposal(null)).toBeNull()
    expect(validateProposal('work 9 to 5')).toBeNull()
  })

  it('drops a kind it does not know rather than the whole proposal', () => {
    expect(validateProposal({ ...good, kind: 'vibes' })?.kind).toBe('fixed')
  })

  it('reads an unclaimed provenance as a quote only when it says so', () => {
    // The safe direction is the opposite one here: a guess wrongly labelled a
    // quote is a guess nobody checks.
    expect(validateProposal({ ...good, end_from: undefined })?.end_from).toBe('quoted')
    expect(validateProposal({ ...good, end_from: 'inferred' })?.end_from).toBe('inferred')
  })

  it('keeps only the days it recognises, in week order', () => {
    expect(validateProposal({ ...good, days: ['fri', 'mon', 'nonsense'] })?.days).toEqual([
      'mon',
      'fri',
    ])
  })
})

describe('alreadyThere', () => {
  const anchor: Anchor = {
    id: 'a1',
    label: 'Work',
    days: ['mon'],
    start: '09:00',
    end: '17:00',
    kind: 'work',
  }

  it('does not offer back an hour the profile already holds', () => {
    const [proposal] = parseAnchors('work 09:00 to 17:00')
    expect(alreadyThere(proposal, [anchor])).toBe(true)
  })

  it('offers one that differs in its hours', () => {
    const [proposal] = parseAnchors('work 09:00 to 15:00')
    expect(alreadyThere(proposal, [anchor])).toBe(false)
  })
})
