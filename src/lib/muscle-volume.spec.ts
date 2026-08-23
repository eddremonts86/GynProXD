import { describe, expect, it } from 'vitest'
import { muscleVolume } from './muscle-volume'
import { populateByIdCache } from './exercises'
import type { Exercise, Workout } from './types'

const exBench: Exercise = { id: 'bench-press', name: 'Bench', muscle: 'chest', equipment: 'barbell' }
const exSquat: Exercise = { id: 'squat', name: 'Squat', muscle: 'quads', equipment: 'barbell' }

describe('muscleVolume', () => {
  it('sums volume per muscle', () => {
    populateByIdCache([exBench, exSquat])
    const w: Workout[] = [
      { id: '1', date: new Date().toISOString().slice(0, 10), exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 60, reps: 8 }] }] },
      { id: '2', date: new Date().toISOString().slice(0, 10), exercises: [{ exerciseId: 'squat', sets: [{ weight: 80, reps: 5 }] }] },
    ]
    const vol = muscleVolume(w, 4)
    expect(vol.chest).toBe(480)
    expect(vol.quads).toBe(400)
    expect(vol.back).toBe(0)
  })
})
