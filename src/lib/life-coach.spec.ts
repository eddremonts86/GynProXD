import { describe, expect, it } from 'vitest'
import { buildPrompt, validateAnchors } from './life-coach'

/**
 * The gate between a model's answer and somebody's week.
 *
 * The claim this phase makes is that the companion cannot put an hour into a
 * profile that the deterministic path could not: it proposes, every proposal
 * goes through the same check, and a person taps each survivor. These are the
 * cases that make that true rather than merely stated.
 */
const good = {
  label: 'work',
  days: ['mon', 'tue', 'wed', 'thu', 'fri'],
  start: '09:00',
  end: '17:00',
  kind: 'work',
  start_from: 'quoted',
  end_from: 'inferred',
  days_from: 'inferred',
}

describe('validateAnchors', () => {
  it('passes a well-formed answer', () => {
    const out = validateAnchors({ anchors: [good] }, 'work 9 to 5')
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ label: 'work', start: '09:00', end: '17:00', kind: 'work' })
  })

  it('stamps the source on every proposal, whatever the model said', () => {
    // The review step shows what a proposal came out of. A model claiming its
    // own source would be quoting itself back as the member's words.
    const out = validateAnchors({ anchors: [{ ...good, clause: 'I made this up' }] }, 'work 9 to 5')
    expect(out[0].clause).toBe('work 9 to 5')
  })

  it('drops the bad entries and keeps the good ones', () => {
    const out = validateAnchors(
      {
        anchors: [
          good,
          { ...good, start: 'lunchtime' },
          { ...good, label: 'school run', start: '08:15', end: '08:45' },
          { ...good, end: '09:00' },
          { ...good, days: [] },
        ],
      },
      'text',
    )
    expect(out.map((a) => a.label)).toEqual(['work', 'school run'])
  })

  it('is empty for every shape that is not an answer', () => {
    for (const raw of [null, undefined, {}, { anchors: null }, { anchors: {} }, 'anchors', 42]) {
      expect(validateAnchors(raw, 'text')).toEqual([])
    }
  })

  it('treats an empty list as an answer rather than a failure', () => {
    // Somebody can write a paragraph with no fixed hours in it. The right
    // response is to propose nothing, not to invent a working day, and the
    // prompt says so out loud.
    expect(validateAnchors({ anchors: [] }, 'I would like to feel better')).toEqual([])
  })

  it('caps what one paragraph can produce', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ ...good, label: `thing ${i}` }))
    expect(validateAnchors({ anchors: many }, 'text')).toHaveLength(8)
  })

  it('cannot be talked past by a proposal that reaches for a longer field', () => {
    const out = validateAnchors({ anchors: [{ ...good, label: 'x'.repeat(500) }] }, 'text')
    expect(out[0].label).toHaveLength(40)
  })
})

describe('buildPrompt', () => {
  it('puts the member words between markers, like the programme intake does', () => {
    const prompt = buildPrompt('work 9 to 5')
    expect(prompt).toContain('--- BEGIN')
    expect(prompt).toContain('work 9 to 5')
    expect(prompt).toContain('--- END')
  })

  it('caps how much prose is sent', () => {
    const prompt = buildPrompt('a'.repeat(5000))
    expect(prompt).toContain('a'.repeat(1200))
    expect(prompt).not.toContain('a'.repeat(1201))
  })

  it('tells it not to invent a working day', () => {
    // The one instruction that decides whether an empty answer is possible.
    expect(buildPrompt('x')).toMatch(/Do not invent a working day/)
  })

  it('asks only for hours somebody does not choose', () => {
    // Training and meals are placed by `buildDay` from the app's own data. A
    // coach proposing "gym at 18:00" as a fixed hour would turn a suggestion
    // into a commitment the planner then has to work around.
    expect(buildPrompt('x')).toMatch(/Not training, not meals/)
  })

  it('asks it to be honest about what it worked out', () => {
    expect(buildPrompt('x')).toMatch(/"inferred" if you worked it out/)
  })
})
