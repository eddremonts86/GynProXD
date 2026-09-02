import { describe, expect, it } from 'vitest'
import { isBuilt, planAllows, planOf, PLUS_FEATURES, type PlusFeature } from './gym-plan'

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
    expect(planAllows('plus', 'scheduling')).toBe(true)
    expect(planAllows('base', 'scheduling')).toBe(false)
  })

  it('refuses a feature it has never heard of', () => {
    // A half-finished feature must not leak out through a Plus account before
    // it is done, which is why the gate asks whether it exists first. This used
    // to name `second-rooms`, the last unbuilt entry; it left the list rather
    // than shipping, because several rooms is what Enterprise sells and no
    // single Plus gym gets it. With nothing unbuilt left to name, the check is
    // on the gate's own default: anything it does not know is refused, which is
    // what protects the next feature between the day it is listed and the day
    // it works.
    expect(planAllows('plus', 'not-a-feature' as PlusFeature)).toBe(false)
    expect(planAllows('base', 'not-a-feature' as PlusFeature)).toBe(false)
  })

  it('agrees with isBuilt for every feature the page lists', () => {
    // The landing marks a feature "Coming" from `isBuilt`. If the two ever
    // disagreed, the page would advertise something the gate refuses.
    for (const feature of PLUS_FEATURES) {
      expect(planAllows('plus', feature)).toBe(isBuilt(feature))
    }
  })
})
