import { describe, expect, it } from 'vitest'
import { SERVER_ID_PREFIX, toExercise } from './useCatalogue'

const row = {
  id: 'kmzut4cwlfkky2q',
  name: 'Landmine Anti-Rotation Press',
  muscle: 'core',
  equipment: 'barbell',
  category: 'strength',
  instructions: JSON.stringify(['Set up.', 'Brace.', 'Press.']),
  image: '',
  published: true,
  updated: '2026-09-01 09:00:00.000Z',
}

/**
 * The prefix is load-bearing in two files.
 *
 * `toExercise` puts it on; the admin panel reads it back off to decide whether
 * a movement can be edited at all — a bundled one cannot, because a release is
 * the only thing that changes those. Get the two out of step and Edit and
 * Delete quietly disappear from every row, with nothing thrown and nothing
 * logged. Hence a constant, and hence this.
 */
describe('toExercise', () => {
  it('marks a server row with the prefix the panel looks for', () => {
    expect(toExercise(row, 'https://sync.example')).toMatchObject({
      id: `${SERVER_ID_PREFIX}${row.id}`,
      name: 'Landmine Anti-Rotation Press',
      muscle: 'core',
      equipment: 'barbell',
    })
  })

  it('leaves the image null when the row has none, rather than a broken URL', () => {
    expect(toExercise(row, 'https://sync.example').image).toBeNull()
  })

  it('asks for the thumbnail rather than the full upload', () => {
    const withImage = { ...row, image: 'press_a1b2.jpg' }
    expect(toExercise(withImage, 'https://sync.example').image).toBe(
      'https://sync.example/api/files/exercises/kmzut4cwlfkky2q/press_a1b2.jpg?thumb=600x0',
    )
  })
})
