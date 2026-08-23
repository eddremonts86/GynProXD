#!/usr/bin/env node
/* Imports yuhonas/free-exercise-db (Unlicense / public domain) into src/data/exercises-generated.ts.
   Images are NOT bundled — they load from the jsDelivr CDN at runtime.
   Run: node scripts/import-free-exercise-db.mjs */

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const SOURCE =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const IMG_BASE =
  'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'

const MUSCLE_MAP = {
  abdominals: 'core',
  abductors: 'glutes',
  adductors: 'glutes',
  biceps: 'biceps',
  calves: 'calves',
  chest: 'chest',
  forearms: 'other',
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'back',
  'lower back': 'back',
  'middle back': 'back',
  neck: 'other',
  quadriceps: 'quads',
  shoulders: 'shoulders',
  triceps: 'triceps',
  traps: 'back',
}

const EQUIPMENT_MAP = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  'body only': 'bodyweight',
  none: 'bodyweight',
  machine: 'machine',
  cable: 'cable',
  kettlebell: 'kettlebell',
  bands: 'band',
  'e-z curl bar': 'barbell',
  'medicine ball': 'other',
  'exercise ball': 'other',
  'foam roll': 'other',
  other: 'other',
}

const _slug = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60)

const res = await fetch(SOURCE)
if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
const raw = await res.json()

const seen = new Set()
const exercises = raw
  .map((x) => ({
    id: x.id,
    name: x.name,
    muscle: MUSCLE_MAP[x.primaryMuscles?.[0]] ?? 'other',
    equipment: EQUIPMENT_MAP[x.equipment] ?? 'other',
    image: x.images?.[0] ? IMG_BASE + x.images[0] : null,
    instructions: Array.isArray(x.instructions) ? x.instructions : [],
  }))
  .filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)))

const out = path.resolve(import.meta.dirname, '../src/data/exercises-generated.ts')
const body = `import type { Exercise } from '../lib/types'

export const generatedExercises: Exercise[] = ${JSON.stringify(exercises, null, 2)}
`
await writeFile(out, body)
console.log(`wrote ${exercises.length} exercises to ${out}`)
