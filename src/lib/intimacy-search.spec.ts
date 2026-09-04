import { describe, expect, it } from 'vitest'
import {
  excludedBy,
  isEmptyQuery,
  matches,
  searchActivities,
} from './intimacy-search'
import { INTIMATE_ACTIVITIES, type IntimateActivity } from '../data/intimacy'

const find = (id: string): IntimateActivity => {
  const found = INTIMATE_ACTIVITIES.find((a) => a.id === id)
  if (!found) throw new Error(`no entry ${id}`)
  return found
}

describe('searchActivities', () => {
  it('asks nothing and returns everything, in the order they were written', () => {
    expect(searchActivities()).toEqual(INTIMATE_ACTIVITIES)
    expect(searchActivities({})).toHaveLength(INTIMATE_ACTIVITIES.length)
  })

  it('narrows across axes and widens within one', () => {
    const light = searchActivities({ effort: ['light'] })
    const lightOrVigorous = searchActivities({ effort: ['light', 'vigorous'] })
    /* Within an axis the values are alternatives, so adding one may only grow
       the list. Across axes they are requirements, so it may only shrink. */
    expect(lightOrVigorous.length).toBeGreaterThan(light.length)
    const lightSeated = searchActivities({ effort: ['light'], postures: ['seated'] })
    expect(lightSeated.length).toBeLessThanOrEqual(light.length)
    expect(lightSeated.every((a) => a.effort === 'light' && a.postures.includes('seated'))).toBe(true)
  })

  it('matches a posture when either person is in it', () => {
    /* "At the edge, one standing" is a lying arrangement and a standing one at
       once, and somebody whose knees rule standing out has to see it under
       standing rather than have it averaged away. */
    const edge = find('edge-of-bed')
    expect(edge.postures).toEqual(['lying', 'standing'])
    expect(searchActivities({ postures: ['standing'] }).map((a) => a.id)).toContain('edge-of-bed')
    expect(searchActivities({ postures: ['lying'] }).map((a) => a.id)).toContain('edge-of-bed')
  })

  it('treats facing as a third state rather than a checkbox', () => {
    const facing = searchActivities({ facing: true })
    const not = searchActivities({ facing: false })
    expect(facing.every((a) => a.facing)).toBe(true)
    expect(not.every((a) => !a.facing)).toBe(true)
    expect(facing.length + not.length).toBe(INTIMATE_ACTIVITIES.length)
    expect(searchActivities({ facing: undefined })).toHaveLength(INTIMATE_ACTIVITIES.length)
  })

  it('searches the note as well as the name, word by word', () => {
    /* The practical line is where the useful nouns are: pillow, chair,
       forearms, blanket. A search that skipped it would miss most of what
       somebody types. */
    const pillow = searchActivities({ text: 'pillow' })
    expect(pillow.length).toBeGreaterThan(0)
    expect(pillow.map((a) => a.id)).toContain('prone-supported')
    /* Two words are both required, and in any order. */
    expect(searchActivities({ text: 'chair back' }).map((a) => a.id)).toEqual(
      searchActivities({ text: 'back chair' }).map((a) => a.id),
    )
    expect(searchActivities({ text: 'trampoline' })).toEqual([])
  })

  it('ignores case, accents and stray spaces', () => {
    expect(searchActivities({ text: '  PÍLLOW ' }).map((a) => a.id)).toEqual(
      searchActivities({ text: 'pillow' }).map((a) => a.id),
    )
  })

  it('subtracts what a named limitation is unkind to, and never selects on suits', () => {
    const backs = searchActivities({ limitations: ['lower-back'] })
    expect(backs.every((a) => !a.avoidWith.includes('lower-back'))).toBe(true)
    /* Something that says nothing about backs is still offered: the filter
       removes what would hurt rather than keeping only what advertises. */
    expect(backs.some((a) => !a.suits.includes('lower-back'))).toBe(true)
  })

  it('puts what explicitly suits the named limitation first', () => {
    const kneeling = searchActivities({ limitations: ['neck'] })
    expect(kneeling[0].suits).toContain('neck')
  })

  it('counts what it left out', () => {
    expect(excludedBy({})).toBe(0)
    const query = { effort: ['light'] } as const
    expect(excludedBy(query)).toBe(INTIMATE_ACTIVITIES.length - searchActivities(query).length)
    expect(excludedBy(query)).toBeGreaterThan(0)
  })
})

describe('matches', () => {
  it('is the same answer the list gives, for one entry', () => {
    const entry = find('seated-facing')
    expect(matches(entry, { postures: ['seated'] })).toBe(true)
    expect(matches(entry, { postures: ['standing'] })).toBe(false)
    expect(matches(entry, { facing: false })).toBe(false)
    expect(matches(entry, { limitations: ['knees'] })).toBe(false)
  })
})

describe('isEmptyQuery', () => {
  it('knows the difference between nothing asked and nothing found', () => {
    expect(isEmptyQuery({})).toBe(true)
    expect(isEmptyQuery({ text: '   ' })).toBe(true)
    expect(isEmptyQuery({ effort: [] })).toBe(true)
    expect(isEmptyQuery({ facing: false })).toBe(false)
    expect(isEmptyQuery({ text: 'chair' })).toBe(false)
  })
})

describe('the library itself', () => {
  it('leaves something for every single limitation, and for the common pairs', () => {
    /* The guarantee the content has to keep: naming one thing you are working
       around must never empty the screen. */
    for (const limitation of [
      'knees',
      'hips',
      'lower-back',
      'shoulders',
      'wrists',
      'neck',
      'pregnancy',
      'limited-mobility',
    ] as const) {
      expect(searchActivities({ limitations: [limitation] }).length).toBeGreaterThan(0)
    }
    expect(searchActivities({ limitations: ['knees', 'lower-back'] }).length).toBeGreaterThan(0)
    expect(searchActivities({ limitations: ['pregnancy', 'knees'] }).length).toBeGreaterThan(0)
  })

  it('has at least five behind every chip on the screen', () => {
    /* The floor the content has to keep, and the reason there are twenty
       entries rather than sixteen. A filter that answers with one card reads as
       broken rather than as selective, so every posture, every effort band and
       both sides of facing have to offer a choice. This is the test that stops
       the next entry quietly dropping one of them below it. */
    const FLOOR = 5
    for (const posture of ['lying', 'seated', 'kneeling', 'standing'] as const) {
      expect(searchActivities({ postures: [posture] }).length).toBeGreaterThanOrEqual(FLOOR)
    }
    for (const effort of ['light', 'moderate', 'vigorous'] as const) {
      expect(searchActivities({ effort: [effort] }).length).toBeGreaterThanOrEqual(FLOOR)
    }
    expect(searchActivities({ facing: true }).length).toBeGreaterThanOrEqual(FLOOR)
    expect(searchActivities({ facing: false }).length).toBeGreaterThanOrEqual(FLOOR)
  })

  it('has an illustration slot on every entry and no illustration in any of them', () => {
    /* Both halves matter. The slot is what makes adding the first drawing a
       one-line change; the emptiness is the honest state until one is
       commissioned, and this test is what would notice a stand-in appearing. */
    for (const activity of INTIMATE_ACTIVITIES) {
      expect(activity).toHaveProperty('art')
      expect(activity.art).toBeNull()
    }
  })

  it('has unique ids, which the file names will depend on', () => {
    const ids = INTIMATE_ACTIVITIES.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^[a-z][a-z0-9-]*$/.test(id))).toBe(true)
  })
})
