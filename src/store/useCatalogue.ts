import { create } from 'zustand'
import { activeAuthHeader, activeServer } from '../lib/sync'
import { stepsOf } from '../lib/exercise-draft'
import type { Equipment, Exercise, ExerciseCategory, MuscleGroup } from '../lib/types'

/**
 * Movements the platform has written, delivered to this device.
 *
 * The bundled catalogue ships with the app and never changes between releases;
 * these can be added or corrected the same afternoon somebody notices. They are
 * cached to localStorage on arrival, so the Library still lists them on a gym
 * floor with no signal — the same posture as the gym message bus, and for the
 * same reason: an app that only works online is not this app.
 *
 * Ids are prefixed `srv-`. A movement id ends up written into a logged workout
 * and has to stay legible years later: `srv-` says the row came from the
 * server, and cannot collide with the two bundled catalogues or with `wger-`.
 */

const STORE_KEY = 'forma-server-exercises'

interface ExerciseRecord {
  id: string
  name: string
  muscle: string
  equipment: string
  category: string
  instructions: unknown
  image: string
  published: boolean
  updated: string
}

function load(): Exercise[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as Exercise[]) : []
  } catch {
    return []
  }
}

export function toExercise(row: ExerciseRecord, base: string): Exercise {
  return {
    id: `srv-${row.id}`,
    name: row.name,
    muscle: row.muscle as MuscleGroup,
    equipment: row.equipment as Equipment,
    category: row.category as ExerciseCategory,
    /* The 600px thumbnail rather than the original: these render in a grid of
       cards, and the full upload is somebody's 3 MB phone photo. */
    image: row.image ? `${base}/api/files/exercises/${row.id}/${row.image}?thumb=600x0` : null,
    instructions: stepsOf(row.instructions),
  }
}

interface CatalogueState {
  exercises: Exercise[]
  /** Absent until the first pull of the session succeeds or fails. */
  pulledAt: string | null
  pull: () => Promise<void>
  rehydrate: () => void
}

export const useCatalogue = create<CatalogueState>()((set) => ({
  exercises: typeof localStorage === 'undefined' ? [] : load(),
  pulledAt: null,

  /**
   * Refreshes from the server, or leaves the cached copy exactly as it is.
   *
   * Signed out, offline or server down all take the same branch on purpose:
   * the movements a member saw yesterday do not disappear because the wifi
   * did. Only a good answer replaces them.
   */
  pull: async () => {
    const auth = activeAuthHeader()
    if (!auth) return
    const base = activeServer()
    try {
      const res = await fetch(
        `${base}/api/collections/exercises/records?perPage=500&sort=name&filter=${encodeURIComponent('published = true')}`,
        { headers: auth },
      )
      if (!res.ok) return
      const data = (await res.json()) as { items: ExerciseRecord[] }
      const exercises = data.items.map((row) => toExercise(row, base))
      localStorage.setItem(STORE_KEY, JSON.stringify(exercises))
      set({ exercises, pulledAt: new Date().toISOString() })
    } catch {
      /* Offline. The cache is the answer. */
    }
  },

  rehydrate: () => set({ exercises: load() }),
}))
