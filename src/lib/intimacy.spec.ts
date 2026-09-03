import { beforeEach, describe, expect, it } from 'vitest'
import {
  activitiesFor,
  excludedCount,
  forgetIntimacy,
  intimacyState,
  intimacyVisible,
  isIntimacyRecord,
  setIntimacyOn,
} from './intimacy'
import { INTIMATE_ACTIVITIES, type Limitation } from '../data/intimacy'
import { COLLECTIONS } from './records'

/**
 * The three gates, the filter that is the actual feature, and the promises
 * about what this module never does.
 *
 * `localStorage` is stubbed the way `notify.spec.ts` stubs it, and for the
 * reason that file records: Node 26 shadows the global with one of its own that
 * is undefined unless the process was started with `--localstorage-file`, and
 * jsdom does not win that fight. The module's own try/catch turns the failure
 * into "off", which is the right answer in a private window and the wrong one
 * in a test asserting that switching it on works.
 */
function stubStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

beforeEach(() => {
  stubStorage()
  forgetIntimacy()
})

describe('the gates', () => {
  it('is off before anybody says otherwise', () => {
    // Nobody encounters this by opening a menu they were using for something
    // else. Off is not a default chosen for tidiness.
    expect(intimacyState()).toEqual({ on: false, affirmed: false })
    expect(intimacyVisible(true)).toBe(false)
  })

  it('needs the subscription as well as the switch', () => {
    setIntimacyOn(true)
    expect(intimacyVisible(true)).toBe(true)
    expect(intimacyVisible(false)).toBe(false)
  })

  it('takes the affirmation with the switch, because half of that is not a state', () => {
    setIntimacyOn(true)
    expect(intimacyState()).toEqual({ on: true, affirmed: true })
  })

  it('switching off keeps the affirmation, forgetting drops it', () => {
    // "Off" means not right now. "Forget" means as though it was never here,
    // which is what a shared phone needs.
    setIntimacyOn(true)
    setIntimacyOn(false)
    expect(intimacyState()).toEqual({ on: false, affirmed: true })
    forgetIntimacy()
    expect(intimacyState()).toEqual({ on: false, affirmed: false })
  })
})

describe('nothing about it is synced', () => {
  it('has no collection in the record engine', () => {
    // The switch and the affirmation live in localStorage on purpose, outside
    // `records.ts`, so they are never in an envelope and never on the server.
    // "This person opted into sexual wellness content" is Article 9 data, and
    // the cheapest way to hold that correctly is not to hold it.
    expect(COLLECTIONS).not.toContain('intimacyLog')
    expect((COLLECTIONS as readonly string[]).some((c) => c.toLowerCase().includes('intima'))).toBe(
      false,
    )
  })

  it('names the collection an aggregate would have to exclude, before one exists', () => {
    // Written now precisely because there is nothing to exclude yet. The moment
    // a log exists, four aggregates have to ask the same question, and a helper
    // they can point at is the difference between one decision and four.
    expect(isIntimacyRecord('intimacyLog')).toBe(true)
    expect(isIntimacyRecord('workouts')).toBe(false)
    for (const collection of COLLECTIONS) {
      expect(isIntimacyRecord(collection)).toBe(false)
    }
  })
})

describe('the filter, which is the actual feature', () => {
  it('is everything when nothing is named', () => {
    expect(activitiesFor([])).toHaveLength(INTIMATE_ACTIVITIES.length)
    expect(excludedCount([])).toBe(0)
  })

  it('drops what is unkind to a bad lower back', () => {
    const kept = activitiesFor(['lower-back'])
    expect(kept.every((a) => !a.avoidWith.includes('lower-back'))).toBe(true)
    expect(kept.length).toBeLessThan(INTIMATE_ACTIVITIES.length)
  })

  it('leaves something for every single limitation', () => {
    // The point of the module. A person working around one thing should not be
    // handed an empty screen, which would read as "not for you".
    const all: Limitation[] = [
      'knees',
      'hips',
      'lower-back',
      'shoulders',
      'wrists',
      'neck',
      'pregnancy',
      'limited-mobility',
    ]
    for (const limitation of all) {
      expect(activitiesFor([limitation]).length).toBeGreaterThan(0)
    }
  })

  it('leaves something for the two that exclude the most, together', () => {
    expect(activitiesFor(['knees', 'lower-back']).length).toBeGreaterThan(0)
    expect(activitiesFor(['pregnancy', 'knees']).length).toBeGreaterThan(0)
  })

  it('counts what it left out, so a short list is explained', () => {
    const limitations: Limitation[] = ['knees']
    expect(excludedCount(limitations)).toBe(
      INTIMATE_ACTIVITIES.length - activitiesFor(limitations).length,
    )
    expect(excludedCount(limitations)).toBeGreaterThan(0)
  })

  it('ignores a limitation it has never heard of rather than emptying the list', () => {
    expect(activitiesFor(['vibes' as Limitation])).toHaveLength(INTIMATE_ACTIVITIES.length)
  })
})

describe('the content itself', () => {
  it('has an id, a name and a description for every entry', () => {
    for (const activity of INTIMATE_ACTIVITIES) {
      expect(activity.id).toMatch(/^[a-z-]+$/)
      expect(activity.name.length).toBeGreaterThan(3)
      expect(activity.description.length).toBeGreaterThan(20)
    }
  })

  it('has distinct ids', () => {
    expect(new Set(INTIMATE_ACTIVITIES.map((a) => a.id)).size).toBe(INTIMATE_ACTIVITIES.length)
  })

  it('never names a limitation as both unkind and suitable', () => {
    for (const activity of INTIMATE_ACTIVITIES) {
      const both = activity.avoidWith.filter((l) => activity.suits.includes(l))
      expect(both).toEqual([])
    }
  })

  it('prints no calorie figure anywhere', () => {
    // A product whose whole claim is that it refuses to lie about how long fat
    // loss takes does not get to start estimating this. `plan-estimate.ts` set
    // that standard; this keeps it.
    for (const activity of INTIMATE_ACTIVITIES) {
      const text = `${activity.name} ${activity.description} ${activity.note ?? ''}`
      expect(text).not.toMatch(/\bk?cal\b|\bcalorie/i)
      expect(text).not.toMatch(/\bburns?\b/i)
    }
  })

  it('makes no claim about anybody body in a note', () => {
    // Notes are practical or they are not there. "Never medical, never a claim
    // about anybody's body" is the field's own contract.
    for (const activity of INTIMATE_ACTIVITIES) {
      if (!activity.note) continue
      expect(activity.note).not.toMatch(/\bcure|\btreat|\bheal|\bimproves? your\b/i)
    }
  })

  it('covers the range of effort, so the filter has somewhere to go', () => {
    const efforts = new Set(INTIMATE_ACTIVITIES.map((a) => a.effort))
    expect([...efforts].sort()).toEqual(['light', 'moderate', 'vigorous'])
  })
})
