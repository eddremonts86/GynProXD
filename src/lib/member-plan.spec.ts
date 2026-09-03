import { describe, expect, it } from 'vitest'
import {
  anythingBuilt,
  isBuilt,
  proAllows,
  PRO_FEATURES,
  PRO_PRICE,
  type ProFeature,
} from './member-plan'

/**
 * The consumer half of the same gate `gym-plan.spec.ts` guards, and the same
 * asymmetry decides every case: a member refused something they paid for asks
 * once and gets it, while a member handed something they did not pay for is
 * revenue that was never charged and a feature that cannot be taken back.
 */
describe('proAllows', () => {
  it('refuses every feature while nothing is built', () => {
    // This is the state of this branch on purpose: the entitlement exists and
    // no screen sits behind it yet. When a phase ships, its name joins BUILT
    // and this expectation changes with it, which is the point of asserting it.
    for (const feature of PRO_FEATURES) {
      expect(proAllows(true, feature)).toBe(false)
    }
  })

  it('refuses a feature it has never heard of, paid or not', () => {
    expect(proAllows(true, 'not-a-feature' as ProFeature)).toBe(false)
    expect(proAllows(false, 'not-a-feature' as ProFeature)).toBe(false)
  })

  it('agrees with isBuilt for every feature the page may list', () => {
    // The pricing copy marks a feature from `isBuilt`. If these two disagreed,
    // the page would sell something the gate refuses, or hide something a
    // paying member already has.
    for (const feature of PRO_FEATURES) {
      expect(proAllows(true, feature)).toBe(isBuilt(feature))
      expect(proAllows(false, feature)).toBe(false)
    }
  })
})

describe('anythingBuilt', () => {
  it('says there is nothing to sell yet', () => {
    // A price with no feature behind it is the one thing the copy must not
    // print. This guard is what lets the subscription panel exist before the
    // first Pro screen does.
    expect(anythingBuilt()).toBe(false)
  })
})

describe('PRO_PRICE', () => {
  it('is a whole number of euros', () => {
    // Not decoration: a price with cents in it has to be formatted in every
    // language the copy is written in, and this product prices in whole euros
    // everywhere else too.
    expect(Number.isInteger(PRO_PRICE)).toBe(true)
    expect(PRO_PRICE).toBe(15)
  })
})
