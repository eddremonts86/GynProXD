import { describe, expect, it } from 'vitest'
import { CELL_PRECISION, geohash } from './geohash'

describe('geohash', () => {
  it('matches the published vectors', () => {
    /* The two everybody checks against: Wikipedia's Jutland point and its
       decode example in León. */
    expect(geohash(57.64911, 10.40744, 11)).toBe('u4pruydqqvj')
    expect(geohash(42.6, -5.6, 5)).toBe('ezs42')
  })

  it('defaults to a five kilometre cell', () => {
    expect(geohash(57.64911, 10.40744)).toHaveLength(CELL_PRECISION)
    expect(geohash(57.64911, 10.40744)).toBe('u4pru')
  })

  it('puts two points a street apart in the same cell, and two towns apart in different ones', () => {
    expect(geohash(41.3874, 2.1686)).toBe(geohash(41.389, 2.171))
    expect(geohash(41.3874, 2.1686)).not.toBe(geohash(41.6176, 0.62))
  })

  it('handles the origin and the edges without looping', () => {
    expect(geohash(0, 0)).toBe('s0000')
    expect(geohash(90, 180)).toHaveLength(5)
    expect(geohash(-90, -180)).toBe('00000')
  })
})
