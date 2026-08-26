import { describe, expect, it } from 'vitest'
import { alternativesFor } from './alternatives'

describe('alternativesFor', () => {
  it('only offers movements for the same muscle, never the movement itself', () => {
    const alts = alternativesFor({ id: 'Barbell_Squat', muscle: 'quads', equipment: 'barbell' })
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.every((a) => a.muscle === 'quads')).toBe(true)
    expect(alts.some((a) => a.id === 'Barbell_Squat')).toBe(false)
  })

  it('puts always-available bodyweight options first', () => {
    const alts = alternativesFor({ id: 'Barbell_Squat', muscle: 'quads', equipment: 'barbell' })
    expect(['bodyweight', 'band']).toContain(alts[0].equipment)
  })

  it('honours exclusions and the limit', () => {
    const all = alternativesFor({ id: 'Barbell_Squat', muscle: 'quads', equipment: 'barbell' })
    const trimmed = alternativesFor(
      { id: 'Barbell_Squat', muscle: 'quads', equipment: 'barbell' },
      { exclude: [all[0].id], limit: 2 },
    )
    expect(trimmed).toHaveLength(2)
    expect(trimmed.some((a) => a.id === all[0].id)).toBe(false)
  })

  it('is stable across calls', () => {
    const a = alternativesFor({ id: 'Pushups', muscle: 'chest', equipment: 'bodyweight' })
    const b = alternativesFor({ id: 'Pushups', muscle: 'chest', equipment: 'bodyweight' })
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
  })
})
