import { describe, expect, it } from 'vitest'
import {
  blankDraft,
  draftFromRecord,
  draftProblems,
  isSavable,
  splitLines,
  stepsOf,
} from './exercise-draft'

const record = {
  id: 'abc123',
  name: 'Sled Push',
  muscle: 'quads',
  equipment: 'other',
  category: 'strongman',
  instructions: ['Load the sled.', 'Drive through the floor.'],
  image: 'sled_9f2.webp',
  published: true,
}

describe('stepsOf', () => {
  it('takes an array of steps as it is, trimmed', () => {
    expect(stepsOf(['  Load it. ', 'Push.'])).toEqual(['Load it.', 'Push.'])
  })

  it('drops blanks rather than rendering an empty numbered line', () => {
    expect(stepsOf(['Push.', '', '   '])).toEqual(['Push.'])
  })

  it('parses a json string, which is how an older row can hold it', () => {
    expect(stepsOf('["Load it.","Push."]')).toEqual(['Load it.', 'Push.'])
  })

  it('falls back to reading plain text as lines', () => {
    expect(stepsOf('Load it.\nPush.')).toEqual(['Load it.', 'Push.'])
  })

  it('is empty for anything else', () => {
    expect(stepsOf(null)).toEqual([])
    expect(stepsOf(42)).toEqual([])
    expect(stepsOf({ steps: ['Push.'] })).toEqual([])
  })
})

describe('draftFromRecord', () => {
  it('turns a saved row back into something a form can hold', () => {
    const draft = draftFromRecord(record)
    expect(draft).toEqual({
      id: 'abc123',
      name: 'Sled Push',
      muscle: 'quads',
      equipment: 'other',
      category: 'strongman',
      instructions: 'Load the sled.\nDrive through the floor.',
      published: true,
      hasImage: true,
    })
  })

  it('remembers whether a picture is already saved, so a new file is optional', () => {
    expect(draftFromRecord({ ...record, image: '' }).hasImage).toBe(false)
  })
})

describe('draftProblems', () => {
  const good = { ...blankDraft(), name: 'Sled Push', instructions: 'Push.' }

  it('passes a complete movement', () => {
    expect(draftProblems(good)).toEqual({})
    expect(isSavable(good)).toBe(true)
  })

  it('wants a name worth putting on a card', () => {
    expect(draftProblems({ ...good, name: ' ' }).name).toBeTruthy()
    expect(draftProblems({ ...good, name: 'x'.repeat(121) }).name).toBeTruthy()
  })

  it('rejects a vocabulary the app does not have', () => {
    expect(draftProblems({ ...good, muscle: 'lats' }).muscle).toBeTruthy()
    expect(draftProblems({ ...good, equipment: 'sled' }).equipment).toBeTruthy()
    expect(draftProblems({ ...good, category: 'yoga' }).category).toBeTruthy()
  })

  it('lets a movement be drafted with no steps, but not published', () => {
    const empty = { ...good, instructions: '' }
    expect(draftProblems({ ...empty, published: false })).toEqual({})
    expect(draftProblems({ ...empty, published: true }).instructions).toBeTruthy()
  })

  it('refuses more steps than anybody reads mid-set', () => {
    const many = Array.from({ length: 31 }, (_, i) => `Step ${i}`).join('\n')
    expect(draftProblems({ ...good, instructions: many }).instructions).toBeTruthy()
  })

  it('refuses a step longer than a paragraph', () => {
    expect(draftProblems({ ...good, instructions: 'x'.repeat(601) }).instructions).toBeTruthy()
  })
})

describe('splitLines', () => {
  it('drops the blank lines somebody leaves between steps', () => {
    expect(splitLines('One.\n\n  Two.  \n')).toEqual(['One.', 'Two.'])
  })
})
