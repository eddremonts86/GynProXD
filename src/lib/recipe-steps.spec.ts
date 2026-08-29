import { describe, expect, it } from 'vitest'
import { stepKind, stepMinutes, type StepKind } from './recipe-steps'

const kind = (text: string): StepKind => stepKind(text)

describe('stepKind', () => {
  it('reads the action out of real USDA MyPlate steps', () => {
    expect(kind('Wash hands with soap and water.')).toBe('wash')
    expect(kind('Rinse the beans under cold water.')).toBe('wash')
    expect(kind('Chop the onion and mince the garlic.')).toBe('cut')
    expect(kind('Heat pan over medium-high heat. Add oil and chicken.')).toBe('heat')
    expect(kind('Bring to a boil; reduce heat to low and simmer, covered.')).toBe('heat')
    expect(kind('Preheat oven to 350 °F.')).toBe('bake')
    expect(kind('Bake for 25 minutes until golden.')).toBe('bake')
    expect(kind('Combine tomatoes, chili sauce and celery in a large bowl.')).toBe('mix')
    expect(kind('Refrigerate leftovers within 2 hours.')).toBe('chill')
    expect(kind('Drain the pasta.')).toBe('drain')
    expect(kind('Serve over hot rice.')).toBe('serve')
  })

  it('prefers the more specific action when a step mentions several', () => {
    expect(kind('Preheat the oven, then heat a pan.')).toBe('bake')
    expect(kind('Wash hands, then chop the peppers.')).toBe('wash')
  })

  it('falls back to a plain step rather than guessing', () => {
    expect(kind('Repeat with the remaining tortillas.')).toBe('plain')
    expect(kind('')).toBe('plain')
  })
})

describe('stepMinutes', () => {
  it('surfaces a timer when the step names one', () => {
    expect(stepMinutes('Bake for 25 minutes until golden.')).toBe(25)
    expect(stepMinutes('Simmer, covered, for 10 to 15 minutes.')).toBe(15)
    expect(stepMinutes('Cook 3-5 minutes per side.')).toBe(5)
    expect(stepMinutes('Let stand 1 minute.')).toBe(1)
  })

  it('is undefined when there is no time to show', () => {
    expect(stepMinutes('Wash hands with soap and water.')).toBeUndefined()
    expect(stepMinutes('Heat to 165 °F.')).toBeUndefined()
  })

  it('ignores food-safety deadlines, which are not cooking timers', () => {
    expect(stepMinutes('Refrigerate leftovers within 2 hours.')).toBeUndefined()
    expect(stepMinutes('Use within 3 days.')).toBeUndefined()
  })
})
