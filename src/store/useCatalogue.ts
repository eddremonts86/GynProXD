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
const HIDDEN_KEY = 'forma-hidden-exercises'

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

function loadList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
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
  /**
   * Ids withdrawn from the library, from any catalogue — bundled, wger or
   * written here. Hiding is not deleting: `exerciseById` still resolves these,
   * so a workout logged before the movement was retired keeps its name.
   */
  hidden: string[]
  /** Absent until the first pull of the session succeeds or fails. */
  pulledAt: string | null
  pull: () => Promise<void>
  rehydrate: () => void
}

export const useCatalogue = create<CatalogueState>()((set) => ({
  exercises: typeof localStorage === 'undefined' ? [] : loadList<Exercise>(STORE_KEY),
  hidden: typeof localStorage === 'undefined' ? [] : loadList<string>(HIDDEN_KEY),
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
      const [written, withdrawn] = await Promise.all([
        fetch(
          `${base}/api/collections/exercises/records?perPage=500&sort=name&filter=${encodeURIComponent('published = true')}`,
          { headers: auth },
        ),
        fetch(`${base}/api/collections/exercises_hidden/records?perPage=500`, { headers: auth }),
      ])
      if (!written.ok || !withdrawn.ok) return
      const rows = (await written.json()) as { items: ExerciseRecord[] }
      const hides = (await withdrawn.json()) as { items: { exerciseId: string }[] }
      const exercises = rows.items.map((row) => toExercise(row, base))
      const hidden = hides.items.map((row) => row.exerciseId)
      localStorage.setItem(STORE_KEY, JSON.stringify(exercises))
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden))
      set({ exercises, hidden, pulledAt: new Date().toISOString() })
    } catch {
      /* Offline. The cache is the answer. */
    }
  },

  rehydrate: () =>
    set({ exercises: loadList<Exercise>(STORE_KEY), hidden: loadList<string>(HIDDEN_KEY) }),
}))
