import { describe, expect, it } from 'vitest'
import { isBuilt, planAllows, planOf, PLUS_FEATURES } from './gym-plan'

/**
 * The gate the pricing page depends on.
 *
 * Every case here is about being wrong in the cheap direction rather than the
 * expensive one: a gym that is refused something it paid for complains and gets
 * it. A gym that is handed something it did not pay for starts using it, and
 * taking it back is worse than never having offered it.
 */
describe('planOf', () => {
  it('reads plus only when it says plus', () => {
    expect(planOf('plus')).toBe('plus')
  })

  it('treats absent, unknown and rubbish as base', () => {
    expect(planOf('base')).toBe('base')
    expect(planOf(undefined)).toBe('base')
    expect(planOf(null)).toBe('base')
    expect(planOf('')).toBe('base')
    expect(planOf('PLUS')).toBe('base')
    expect(planOf(1)).toBe('base')
    expect(planOf({ plan: 'plus' })).toBe('base')
  })
})

describe('planAllows', () => {
  it('gives a built feature to Plus and not to Base', () => {
    expect(planAllows('plus', 'kitchen')).toBe(true)
    expect(planAllows('base', 'kitchen')).toBe(false)
    expect(planAllows('plus', 'programmes')).toBe(true)
    expect(planAllows('base', 'programmes')).toBe(false)
  })

  it('refuses an unbuilt feature to everybody', () => {
    // A half-finished feature must not leak out through a Plus account before
    // it is done, which is why the gate asks whether it exists first.
    // `scheduling` is the example because it is not built; when it ships, this
    // moves up to the case above rather than being deleted.
    expect(planAllows('plus', 'scheduling')).toBe(false)
    expect(planAllows('base', 'scheduling')).toBe(false)
  })

  it('agrees with isBuilt for every feature the page lists', () => {
    // The landing marks a feature "Coming" from `isBuilt`. If the two ever
    // disagreed, the page would advertise something the gate refuses.
    for (const feature of PLUS_FEATURES) {
      expect(planAllows('plus', feature)).toBe(isBuilt(feature))
    }
  })
})
