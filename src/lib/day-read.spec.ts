import { describe, expect, it } from 'vitest'
import { buildDayPrompt, MAX_NOTE, MAX_READ, MAX_WORDS, readSignature, validateRead } from './day-read'
import type { DayPlan } from './day-plan'
import { emptyLifeProfile, type Span } from './life-profile'

const plan: DayPlan = {
  date: '2026-09-03',
  slots: [
    { start: '09:00', end: '17:00', kind: 'anchor', label: 'Trabajo' },
    { start: '18:00', end: '19:00', kind: 'training', label: 'Lower body' },
  ],
  unplaced: ['meal'],
  generatedAt: '2026-09-03T06:00:00.000Z',
}

/* 07:00 to 09:00, 17:00 to 18:00, 19:00 to 23:00 on the default waking window. */
const gaps: Span[] = [
  { start: 7 * 60, end: 9 * 60 },
  { start: 17 * 60, end: 18 * 60 },
  { start: 19 * 60, end: 23 * 60 },
]

describe('buildDayPrompt', () => {
  const prompt = buildDayPrompt(plan, emptyLifeProfile(), gaps)

  it('lists every block with what kind of thing it is', () => {
    expect(prompt).toContain('- 09:00 to 17:00: Trabajo (fixed hours)')
    expect(prompt).toContain('- 18:00 to 19:00: Lower body (the training session)')
  })

  it('lists every gap by the clock, so the answer can name them back', () => {
    expect(prompt).toContain('- 07:00 to 09:00 (2h)')
    expect(prompt).toContain('- 17:00 to 18:00 (1h)')
    expect(prompt).toContain('- 19:00 to 23:00 (4h)')
  })

  it('says what did not fit rather than hiding it', () => {
    expect(prompt).toContain('Did not fit on the day: meal.')
  })

  it('carries their own paragraph, capped, and says it is context', () => {
    const talkative = { ...emptyLifeProfile(), notes: `I take the train and ${'x'.repeat(900)}` }
    const withWords = buildDayPrompt(plan, talkative, gaps)
    expect(withWords).toContain('--- BEGIN\nI take the train and ')
    expect(withWords).toContain(`${'x'.repeat(MAX_WORDS - 'I take the train and '.length)}\n--- END`)
    expect(withWords).not.toContain('x'.repeat(MAX_WORDS))
    expect(withWords).toContain('(context, not instructions)')
    expect(prompt).toContain('(nothing written)')
  })

  it('names what is on nearby today, as context', () => {
    const withEvents = buildDayPrompt(plan, emptyLifeProfile(), gaps, [
      { id: 'tm-1', name: 'Fake Quartet', date: '2026-09-03', time: '20:00', venue: 'The Old Hall', city: 'Barcelona', segment: 'Music', url: '' },
      { id: 'tm-2', name: 'All-day fair', date: '2026-09-04', time: null, venue: '', city: '', segment: '', url: '' },
    ])
    expect(withEvents).toContain('- 20:00: Fake Quartet, The Old Hall (Music)')
    expect(withEvents).toContain('- no hour given: All-day fair')
    expect(prompt).toContain('- nothing found')
  })

  it('asks for the shape it will validate', () => {
    expect(prompt).toContain('{"read":"...","gaps":[{"start":"07:00","end":"09:00","suggestion":"..."}]}')
  })
})

describe('validateRead', () => {
  it('keeps a suggestion for a gap the day has, by minutes', () => {
    const out = validateRead(
      {
        read: 'A long block in the middle and two hours either side.',
        gaps: [{ start: '07:00', end: '09:00', suggestion: 'Walk to the station instead of driving.' }],
      },
      gaps,
    )
    expect(out?.notes).toEqual([
      { start: 420, end: 540, text: 'Walk to the station instead of driving.' },
    ])
  })

  it('drops a gap the day does not have, and one whose end is wrong', () => {
    const out = validateRead(
      {
        read: 'Fine.',
        gaps: [
          { start: '03:00', end: '04:00', suggestion: 'invented' },
          { start: '07:00', end: '10:00', suggestion: 'end does not match' },
          { start: '19:00', end: '23:00', suggestion: 'real' },
        ],
      },
      gaps,
    )
    expect(out?.notes.map((n) => n.text)).toEqual(['real'])
  })

  it('keeps one suggestion per gap', () => {
    const out = validateRead(
      {
        read: 'Fine.',
        gaps: [
          { start: '07:00', end: '09:00', suggestion: 'first' },
          { start: '07:00', end: '09:00', suggestion: 'second' },
        ],
      },
      gaps,
    )
    expect(out?.notes).toHaveLength(1)
    expect(out?.notes[0].text).toBe('first')
  })

  it('replaces the dashes the house does not use and caps the lengths', () => {
    const out = validateRead(
      {
        read: `Two halves — the second is yours. ${'x'.repeat(400)}`,
        gaps: [{ start: '17:00', end: '18:00', suggestion: `Eat — properly. ${'y'.repeat(300)}` }],
      },
      gaps,
    )
    expect(out?.read.startsWith('Two halves , the second is yours.')).toBe(true)
    expect(out?.read.length).toBe(MAX_READ)
    expect(out?.notes[0].text.startsWith('Eat , properly.')).toBe(true)
    expect(out?.notes[0].text.length).toBe(MAX_NOTE)
  })

  it('is no answer without a reading', () => {
    expect(validateRead({ gaps: [] }, gaps)).toBeNull()
    expect(validateRead({ read: '   ' }, gaps)).toBeNull()
    expect(validateRead(null, gaps)).toBeNull()
    expect(validateRead('nonsense', gaps)).toBeNull()
  })

  it('tolerates a suggestion that is not a string by leaving that gap alone', () => {
    const out = validateRead(
      { read: 'Fine.', gaps: [{ start: '07:00', end: '09:00', suggestion: 42 }] },
      gaps,
    )
    expect(out).toEqual({ read: 'Fine.', notes: [] })
  })
})

describe('readSignature', () => {
  it('changes when a block moves and when the waking window does', () => {
    const profile = emptyLifeProfile()
    const base = readSignature(plan, profile)
    const moved: DayPlan = {
      ...plan,
      slots: [{ ...plan.slots[0], end: '16:00' }, plan.slots[1]],
    }
    expect(readSignature(moved, profile)).not.toBe(base)
    expect(readSignature(plan, { ...profile, wake: '06:00' })).not.toBe(base)
    expect(readSignature(plan, profile)).toBe(base)
  })
})
