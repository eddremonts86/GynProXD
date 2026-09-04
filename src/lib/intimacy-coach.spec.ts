import { describe, expect, it } from 'vitest'
import {
  MAX_REASON,
  MAX_SUGGESTIONS,
  buildLibraryPrompt,
  validateSuggestion,
} from './intimacy-coach'
import { pickForDay, searchActivities } from './intimacy-search'
import { INTIMATE_ACTIVITIES } from '../data/intimacy'

/**
 * The two halves of letting a model near this module.
 *
 * What goes out is the sentence somebody typed and a list of ids, and the test
 * that matters is the one asserting what does *not* go out: nothing about the
 * body. What comes back is ids, and the test that matters is that an invented
 * one cannot reach a screen.
 */
describe('buildLibraryPrompt', () => {
  const pool = searchActivities({})
  const prompt = buildLibraryPrompt('something for a night when we are both exhausted', pool)

  it('sends the sentence and the ids to choose between', () => {
    expect(prompt).toContain('--- BEGIN\nsomething for a night when we are both exhausted\n--- END')
    expect(prompt).toContain('- facing-side: Side by side, facing.')
    expect(prompt).toContain('Use these ids and no others')
  })

  it('sends nothing about the body', () => {
    /* The limitations filter the pool before this is built and again after the
       answer arrives. They never travel, and this is the assertion that would
       notice if somebody added them "for context". */
    const filtered = searchActivities({ limitations: ['lower-back', 'pregnancy'] })
    const narrowed = buildLibraryPrompt('anything', filtered)
    for (const word of ['lower-back', 'pregnancy', 'avoidWith', 'suits', 'Hard on']) {
      expect(narrowed).not.toContain(word)
    }
    /* And what is unkind to a named limitation is not even a candidate. */
    expect(narrowed).not.toContain('standing-braced')
  })

  it('asks for a bounded answer and for silence when nothing fits', () => {
    expect(prompt).toContain(`at most ${MAX_SUGGESTIONS} ids`)
    expect(prompt).toContain(`at most ${MAX_REASON} characters`)
    expect(prompt).toContain('empty list rather than the closest thing')
    expect(prompt).toContain('{"picks":[{"id":"seated-facing","why":"..."}]}')
  })
})

describe('validateSuggestion', () => {
  const pool = searchActivities({})

  it('keeps an id that exists, with its sentence', () => {
    const out = validateSuggestion(
      { picks: [{ id: 'spooning', why: 'Neither person carries any weight.' }] },
      pool,
    )
    expect(out).toHaveLength(1)
    expect(out[0].activity.id).toBe('spooning')
    expect(out[0].reason).toBe('Neither person carries any weight.')
  })

  it('drops an invented id, a renamed one and a repeat', () => {
    const out = validateSuggestion(
      {
        picks: [
          { id: 'the-wheelbarrow', why: 'invented' },
          { id: 'spooning', why: 'first' },
          { id: 'spooning', why: 'again' },
          { id: 'Spooning', why: 'wrong case' },
        ],
      },
      pool,
    )
    expect(out.map((s) => s.activity.id)).toEqual(['spooning'])
    expect(out[0].reason).toBe('first')
  })

  it('drops an id that is outside the pool it was given', () => {
    /* Which is how the limitations still decide the answer without leaving the
       device: a model told about twenty may only return the fifteen that are
       kind to this body. */
    const kind = searchActivities({ limitations: ['knees'] })
    expect(kind.map((a) => a.id)).not.toContain('standing-braced')
    expect(validateSuggestion({ picks: [{ id: 'standing-braced', why: 'no' }] }, kind)).toEqual([])
  })

  it('needs a sentence, and cleans and caps the one it gets', () => {
    expect(validateSuggestion({ picks: [{ id: 'spooning' }] }, pool)).toEqual([])
    expect(validateSuggestion({ picks: [{ id: 'spooning', why: '  ' }] }, pool)).toEqual([])
    const long = validateSuggestion(
      { picks: [{ id: 'spooning', why: `Kind — to a back. ${'x'.repeat(400)}` }] },
      pool,
    )
    expect(long[0].reason.startsWith('Kind , to a back.')).toBe(true)
    expect(long[0].reason.length).toBe(MAX_REASON)
  })

  it('stops at three, and survives nonsense', () => {
    const many = { picks: INTIMATE_ACTIVITIES.map((a) => ({ id: a.id, why: 'because' })) }
    expect(validateSuggestion(many, pool)).toHaveLength(MAX_SUGGESTIONS)
    expect(validateSuggestion(null, pool)).toEqual([])
    expect(validateSuggestion({ picks: 'soon' }, pool)).toEqual([])
    expect(validateSuggestion('nonsense', pool)).toEqual([])
  })
})

describe('pickForDay', () => {
  it('is the same all day and different tomorrow', () => {
    const today = pickForDay('2026-09-04')
    expect(pickForDay('2026-09-04')?.id).toBe(today?.id)
    /* Not a guarantee for any given pair of dates, but over a week the pick has
       to move or it is not a daily pick at all. */
    const week = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10']
    expect(new Set(week.map((d) => pickForDay(d)?.id)).size).toBeGreaterThan(1)
  })

  it('never picks something unkind to what was named', () => {
    for (const date of ['2026-09-04', '2026-10-11', '2027-01-01', '2026-12-25']) {
      const picked = pickForDay(date, ['knees', 'lower-back'])
      expect(picked).not.toBeNull()
      expect(picked!.avoidWith).not.toContain('knees')
      expect(picked!.avoidWith).not.toContain('lower-back')
    }
  })

  it('answers nothing rather than something unkind when nothing is left', () => {
    expect(pickForDay('2026-09-04', [], [])).toBeNull()
  })
})
