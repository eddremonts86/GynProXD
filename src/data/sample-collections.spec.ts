import { describe, expect, it } from 'vitest'
import { SAMPLE_COLLECTIONS } from './sample-collections'
import { exerciseLookup } from '../lib/exercises'
import { validCollectionIds } from '../lib/collection'

/**
 * `validCollectionIds` drops ids the catalogue does not know, which is right at
 * runtime — a gym publishing a stale id should get a shorter list rather than a
 * broken page. It is the wrong behaviour for the bundled collections, because
 * nothing distinguishes "this collection has six movements" from "this
 * collection has seven and one of them is a typo". The rail renders both
 * identically and neither logs.
 *
 * That is the whole reason for this file. `Dumbbell_Deadlift` was in the first
 * draft of `sample-dumbbells` and does not exist; the catalogue calls it
 * `Stiff-Legged_Dumbbell_Deadlift`. It would have shipped as a collection of
 * eight silently claiming to be nine.
 */
const catalogue = exerciseLookup([])

describe('bundled collections', () => {
  it('reference only movements the catalogue actually has', () => {
    const unresolved = SAMPLE_COLLECTIONS.flatMap((c) =>
      c.exerciseIds.filter((id) => !catalogue.has(id)).map((id) => `${c.id} → ${id}`),
    )
    expect(unresolved).toEqual([])
  })

  it('survive the runtime filter without losing a movement', () => {
    for (const c of SAMPLE_COLLECTIONS) {
      const kept = validCollectionIds(c.exerciseIds, (id) => catalogue.has(id))
      expect(kept, c.id).toEqual(c.exerciseIds)
    }
  })

  it('have unique ids, so the rail cannot render two chips with one key', () => {
    const ids = SAMPLE_COLLECTIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('list no movement twice within one collection', () => {
    for (const c of SAMPLE_COLLECTIONS) {
      expect(new Set(c.exerciseIds).size, c.id).toBe(c.exerciseIds.length)
    }
  })

  it('carry a name and a blurb, which are the only things the rail can show', () => {
    for (const c of SAMPLE_COLLECTIONS) {
      expect(c.name.trim(), c.id).not.toBe('')
      // The blurb is the chip's `title`, so an empty one is a chip that explains
      // nothing on hover and reads as a bare word in a row of bare words.
      expect(c.blurb?.trim() ?? '', c.id).not.toBe('')
    }
  })

  it('are long enough to be worth opening', () => {
    // Under about five movements a collection is a shortcut to a near-empty
    // grid, which reads as a broken filter rather than as an editorial choice.
    for (const c of SAMPLE_COLLECTIONS) {
      expect(c.exerciseIds.length, c.id).toBeGreaterThanOrEqual(5)
    }
  })
})
