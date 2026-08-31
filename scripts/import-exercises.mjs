#!/usr/bin/env node
/**
 * Builds the bundled movement catalogue from the two upstream datasets.
 *
 *   free-exercise-db  Unlicense (public domain). 873 movements, photographs
 *                     hot-loaded from jsDelivr. The historical source: its ids
 *                     are written into every logged workout, so they are frozen.
 *   RepDB free tier   attribution required, in-app use only. 601 movements with
 *                     flat WebP illustrations, MET values, difficulty and full
 *                     Spanish text.
 *
 * This script owns `src/data/exercises-generated.ts` — it replaces the old
 * import-free-exercise-db.mjs, which knew nothing about RepDB and would have
 * silently dropped it on the next run.
 *
 * Two files come out, split by weight rather than by source:
 *   src/data/exercises-generated.ts        the catalogue the app imports eagerly
 *   src/data/exercise-details-generated.json  Spanish text, MET, tips, goals —
 *                                          loaded on demand, never bundled
 *
 * Run: node scripts/import-exercises.mjs [--no-media]
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const FED_SOURCE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json'
const FED_IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/'
const REPDB_SOURCE = 'https://exercise-dataset.com/exercises.json'
const REPDB_IMG_BASE = 'https://exercise-dataset.com/'
const REPDB_DIR = path.join(ROOT, 'public/repdb')

const skipMedia = process.argv.includes('--no-media')

/* ---------------------------------------------------------------- vocabulary */

/** The app knows eleven muscle groups; both datasets are more specific. */
const FED_MUSCLE = {
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

const FED_EQUIPMENT = {
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

const REPDB_MUSCLE = {
  gluteus_maximus: 'glutes',
  gluteus_medius: 'glutes',
  abductors: 'glutes',
  adductors: 'glutes',
  quadriceps: 'quads',
  hamstrings: 'hamstrings',
  gastrocnemius: 'calves',
  soleus: 'calves',
  pectoralis_major: 'chest',
  latissimus_dorsi: 'back',
  trapezius: 'back',
  rhomboids: 'back',
  erector_spinae: 'back',
  quadratus_lumborum: 'back',
  anterior_deltoid: 'shoulders',
  lateral_deltoid: 'shoulders',
  posterior_deltoid: 'shoulders',
  biceps_brachii: 'biceps',
  brachialis: 'biceps',
  brachioradialis: 'biceps',
  triceps_brachii: 'triceps',
  rectus_abdominis: 'core',
  obliques: 'core',
  transverse_abdominis: 'core',
  hip_flexors: 'core',
  forearm_flexors: 'other',
  forearm_extensors: 'other',
}

/** Used only when a RepDB movement has no primary muscle we recognise. */
const REPDB_BODY_PART = {
  upper_legs: 'quads',
  lower_legs: 'calves',
  back: 'back',
  chest: 'chest',
  shoulders: 'shoulders',
  core: 'core',
  upper_arms: 'other',
  lower_arms: 'other',
  full_body: 'other',
}

/**
 * RepDB names the apparatus; the app names the implement. Anything hanging,
 * pressing or dipping against your own bodyweight stays `bodyweight` — that is
 * what the equipment filter means to someone choosing a plan.
 */
const REPDB_EQUIPMENT = {
  barbell: 'barbell',
  ez_bar: 'barbell',
  trap_bar: 'barbell',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  cable: 'cable',
  loop_band: 'band',
  resistance_band: 'band',
  smith_machine: 'machine',
  leg_press: 'machine',
  leg_curl: 'machine',
  leg_extension: 'machine',
  hack_squat: 'machine',
  pec_deck: 'machine',
  glute_ham_developer: 'machine',
  lat_pulldown_machine: 'machine',
  shoulder_press_machine: 'machine',
  chest_press_machine: 'machine',
  chest_fly_machine: 'machine',
  bicep_curl_machine: 'machine',
  preacher_curl_machine: 'machine',
  tricep_extension_machine: 'machine',
  ab_crunch_machine: 'machine',
  back_extension_machine: 'machine',
  hip_abduction_machine: 'machine',
  hip_adduction_machine: 'machine',
  hip_thrust_machine: 'machine',
  shrug_machine: 'machine',
  standing_calf_raise_machine: 'machine',
  seated_calf_raise_machine: 'machine',
  donkey_calf_raise_machine: 'machine',
  plate_loaded_lateral_raise_machine: 'machine',
  assisted_pullup_machine: 'machine',
  dip_machine: 'machine',
  treadmill: 'machine',
  elliptical: 'machine',
  rower: 'machine',
  stationary_bike: 'machine',
  stair_climber: 'machine',
  air_bike: 'machine',
  sled: 'machine',
  pull_up_bar: 'bodyweight',
  dip_station: 'bodyweight',
  rings: 'bodyweight',
  suspension_trainer: 'bodyweight',
  climbing_rope: 'bodyweight',
  plyo_box: 'bodyweight',
  flat_bench: 'bodyweight',
  stability_ball: 'other',
  battle_rope: 'other',
  slam_ball: 'other',
  jump_rope: 'other',
  wrist_roller: 'other',
  plates: 'other',
}

const FED_CATEGORY = {
  strength: 'strength',
  powerlifting: 'strength',
  stretching: 'stretching',
  plyometrics: 'plyometrics',
  strongman: 'strongman',
  cardio: 'cardio',
  'olympic weightlifting': 'olympic',
}

const REPDB_CATEGORY = {
  strength: 'strength',
  stretching: 'stretching',
  cardio: 'cardio',
  plyometrics: 'plyometrics',
  olympic: 'olympic',
}

/**
 * The same movement under two spellings. Fuzzy matching was tried and rejected:
 * at any threshold loose enough to catch "Barbell Back Squat" it also folded
 * "Dumbbell Snatch" into "Dumbbell Squat". So the automatic rule is exact
 * name equality after normalisation, and everything else is decided here, by
 * hand, once. Left is the RepDB id, right the free-exercise-db id that wins.
 */
const ALIASES = {
  'band-assisted-pull-ups': 'Band_Assisted_Pull-Up',
  'banded-good-morning': 'Band_Good_Morning',
  'battle-ropes': 'Battling_Ropes',
  'behind-the-back-barbell-shrug': 'Barbell_Shrug_Behind_The_Back',
  'bench-leg-pull-in': 'Flat_Bench_Leg_Pull-In',
  'bench-press': 'Barbell_Bench_Press_-_Medium_Grip',
  'bent-over-db-row': 'Bent_Over_Two-Dumbbell_Row',
  'cable-front-raise': 'Front_Cable_Raise',
  'cable-upright-row': 'Upright_Cable_Row',
  'chest-press-machine': 'Machine_Bench_Press',
  'chin-ups': 'Chin-Up',
  'close-grip-bench-press': 'Close-Grip_Barbell_Bench_Press',
  'close-grip-lat-pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'db-fly': 'Dumbbell_Flyes',
  'decline-db-fly': 'Decline_Dumbbell_Flyes',
  'dumbbell-front-raise': 'Front_Dumbbell_Raise',
  'incline-dumbbell-fly': 'Incline_Dumbbell_Flyes',
  'kneeling-hip-flexor-stretch': 'Kneeling_Hip_Flexor',
  'lying-tricep-extension': 'Lying_Triceps_Press',
  'machine-shoulder-press': 'Machine_Shoulder_Military_Press',
  'muscle-ups': 'Muscle_Up',
  'neck-side-stretch': 'Side_Neck_Stretch',
  'reverse-crunches': 'Reverse_Crunch',
  'scapular-pull-ups': 'Scapular_Pull-Up',
  'seated-dumbbell-lateral-raise': 'Seated_Side_Lateral_Raise',
  'single-arm-db-row': 'One-Arm_Dumbbell_Row',
  'single-leg-extension': 'Single-Leg_Leg_Extension',
  'sit-ups': 'Sit-Up',
  squat: 'Barbell_Full_Squat',
  'treadmill-running': 'Running_Treadmill',
  'tricep-kickback': 'Tricep_Dumbbell_Kickback',
  'tricep-pushdown': 'Triceps_Pushdown',
  'upright-row': 'Upright_Barbell_Row',
  'v-bar-lat-pulldown': 'V-Bar_Pulldown',
  'weighted-pull-up': 'Weighted_Pull_Ups',
  'wide-grip-bench-press': 'Wide-Grip_Barbell_Bench_Press',
}

/* ------------------------------------------------------------------ helpers */

const SYNONYMS = {
  pushup: 'push up',
  pushups: 'push up',
  pullup: 'pull up',
  pullups: 'pull up',
  situp: 'sit up',
  chinup: 'chin up',
}

/** Lowercase, depunctuated, de-pluralised. Two names normalising alike are the same movement. */
function normalise(name) {
  const flat = name
    .toLowerCase()
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat
    .split(' ')
    .map((word) => SYNONYMS[word] ?? word)
    .join(' ')
    .split(' ')
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ')
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.json()
}

/* ------------------------------------------------------------------ sources */

async function loadFreeExerciseDb() {
  const raw = await fetchJson(FED_SOURCE)
  const seen = new Set()
  return raw
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .map((x) => ({
      id: x.id,
      name: x.name,
      muscle: FED_MUSCLE[x.primaryMuscles?.[0]] ?? 'other',
      equipment: FED_EQUIPMENT[x.equipment] ?? 'other',
      category: FED_CATEGORY[x.category] ?? 'strength',
      image: x.images?.[0] ? FED_IMG_BASE + x.images[0] : null,
      instructions: Array.isArray(x.instructions) ? x.instructions : [],
    }))
}

async function loadRepDb() {
  const payload = await fetchJson(REPDB_SOURCE)
  return payload.exercises.map((x) => {
    const flat = x.images?.flat ?? {}
    return {
      id: x.id,
      name: x.name_en,
      muscle: REPDB_MUSCLE[x.primary_muscles?.[0]] ?? REPDB_BODY_PART[x.body_part] ?? 'other',
      /* No apparatus at all in RepDB means the movement needs none. */
      equipment: x.equipment ? (REPDB_EQUIPMENT[x.equipment] ?? 'other') : 'bodyweight',
      category: REPDB_CATEGORY[x.category] ?? 'strength',
      instructions: x.instructions_en ?? [],
      /* `start`/`peak` is a two-frame movement, `main` a single hold or stretch. */
      files: [flat.start, flat.peak, flat.main].filter(Boolean).map((p) => path.basename(p)),
      details: {
        source: 'repdb',
        nameEs: x.name_es,
        descriptionEn: x.description_en,
        descriptionEs: x.description_es,
        instructionsEs: x.instructions_es ?? [],
        tipsEn: x.tips_en ?? [],
        tipsEs: x.tips_es ?? [],
        met: x.met,
        difficulty: x.difficulty,
        mechanic: x.mechanic,
        force: x.force_type,
        goals: x.goals ?? [],
        secondaryMuscles: x.secondary_muscles ?? [],
        unilateral: x.is_unilateral,
      },
    }
  })
}

/* -------------------------------------------------------------------- merge */

const [fed, repdb] = await Promise.all([loadFreeExerciseDb(), loadRepDb()])

const catalogue = new Map(fed.map((e) => [e.id, e]))
const details = {}

/* A normalised name shared by two free-exercise-db movements cannot identify
   either of them, so those keys are dropped rather than guessed at. */
const byName = new Map()
const ambiguous = new Set()
for (const e of fed) {
  const key = normalise(e.name)
  if (byName.has(key)) ambiguous.add(key)
  byName.set(key, e.id)
}
for (const key of ambiguous) byName.delete(key)

/* Same words, different order — "Cable Front Raise" and "Front Cable Raise" are
   one movement. Precise enough to be an error rather than a suggestion; looser
   heuristics flagged every legitimate variant ("Wide Grip Push Ups") too. */
const byTokens = new Map()
for (const e of fed) byTokens.set([...new Set(normalise(e.name).split(' '))].sort().join(' '), e.id)

const repdbImages = JSON.parse(await readFile(path.join(ROOT, 'src/data/repdb-images.json'), 'utf8'))
const wanted = new Set()
const stats = { enriched: 0, added: 0, aliased: 0 }
const collisions = []
const claimed = new Map()

for (const ex of repdb) {
  const target = ALIASES[ex.id] ?? byName.get(normalise(ex.name))
  if (ALIASES[ex.id]) {
    stats.aliased += 1
    if (!catalogue.has(ALIASES[ex.id])) {
      throw new Error(`alias ${ex.id} -> ${ALIASES[ex.id]} points at an id that is not in free-exercise-db`)
    }
  }

  /* Two RepDB movements landing on one catalogue entry means one of them is
     being thrown away silently. Always a wrong alias; never acceptable. */
  if (target && claimed.has(target)) {
    throw new Error(`${ex.id} and ${claimed.get(target)} both merge into ${target} — drop one alias`)
  }
  if (target) claimed.set(target, ex.id)

  if (target) {
    /* The free-exercise-db entry keeps its id, name and photographs: workouts
       already logged reference that id, and the photo shows a real body. Only
       the teaching layer is enriched. */
    const existing = catalogue.get(target)
    if (!existing.instructions?.length) existing.instructions = ex.instructions
    details[target] = { ...ex.details, repdbId: ex.id }
    /* Give the movement its RepDB illustration if the curated map has none. */
    if (!repdbImages[target] && ex.files.length > 0) repdbImages[target] = `/repdb/${ex.files[0]}`
    for (const f of ex.files) wanted.add(f)
    stats.enriched += 1
    continue
  }

  if (catalogue.has(ex.id)) throw new Error(`RepDB id ${ex.id} collides with a free-exercise-db id`)

  catalogue.set(ex.id, {
    id: ex.id,
    name: ex.name,
    muscle: ex.muscle,
    equipment: ex.equipment,
    category: ex.category,
    /* Start frame first: `exercisePhotoFrames` pairs it with the peak. */
    image: ex.files[0] ? `/repdb/${ex.files[0]}` : null,
    instructions: ex.instructions,
  })
  details[ex.id] = { ...ex.details, repdbId: ex.id }
  repdbImages[ex.id] = ex.files[0] ? `/repdb/${ex.files[0]}` : undefined
  if (!repdbImages[ex.id]) delete repdbImages[ex.id]
  for (const f of ex.files) wanted.add(f)
  stats.added += 1

  const reordered = byTokens.get([...new Set(normalise(ex.name).split(' '))].sort().join(' '))
  if (reordered) collisions.push(`${ex.id} — "${ex.name}" is "${reordered}" reworded; add an alias`)
}

/* -------------------------------------------------------------------- media */

let downloaded = 0
let unavailable = 0
if (!skipMedia) {
  await mkdir(REPDB_DIR, { recursive: true })
  const missing = [...wanted].filter((f) => !existsSync(path.join(REPDB_DIR, f)))
  console.log(`${missing.length} illustrations to fetch`)
  /* Eight at a time: enough to be quick, polite enough not to look like a scrape. */
  const queue = [...missing]
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (let file = queue.pop(); file; file = queue.pop()) {
        const res = await fetch(`${REPDB_IMG_BASE}images/flat/${file}`)
        if (!res.ok) {
          unavailable += 1
          console.warn(`  missing upstream: ${file} (${res.status})`)
          continue
        }
        await writeFile(path.join(REPDB_DIR, file), Buffer.from(await res.arrayBuffer()))
        downloaded += 1
      }
    }),
  )
}

/* ------------------------------------------------------------------- output */

const exercises = [...catalogue.values()].sort((a, b) => a.name.localeCompare(b.name))

await writeFile(
  path.join(ROOT, 'src/data/exercises-generated.ts'),
  `import type { Exercise } from '../lib/types'

export const generatedExercises: Exercise[] = ${JSON.stringify(exercises, null, 2)}
`,
)

/* Sorted so a re-import produces a reviewable diff rather than a reshuffle. */
const sortedDetails = Object.fromEntries(Object.entries(details).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(
  path.join(ROOT, 'src/data/exercise-details-generated.json'),
  `${JSON.stringify(sortedDetails, null, 2)}\n`,
)

const sortedImages = Object.fromEntries(Object.entries(repdbImages).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(path.join(ROOT, 'src/data/repdb-images.json'), `${JSON.stringify(sortedImages, null, 2)}\n`)

/* The landing page states the size of the library. It said 873 for long enough
   to be wrong in six places, so it reads the number from here instead — a few
   bytes, rather than importing a megabyte of catalogue into the signed-out page. */
await writeFile(
  path.join(ROOT, 'src/data/catalogue-stats.ts'),
  `/* Generated by scripts/import-exercises.mjs. Do not edit. */

export const CATALOGUE_SIZE = ${exercises.length}
export const CATALOGUE_PUBLIC_DOMAIN = ${fed.length}
export const CATALOGUE_TRANSLATED = ${Object.keys(sortedDetails).length}
`,
)

console.log(`\n${exercises.length} movements in the catalogue`)
console.log(`  ${fed.length} from free-exercise-db`)
console.log(`  ${stats.added} added by RepDB, ${stats.enriched} existing ones enriched (${stats.aliased} via alias)`)
console.log(`  ${Object.keys(sortedDetails).length} with Spanish text and MET`)
if (!skipMedia) console.log(`  ${downloaded} illustrations downloaded${unavailable ? `, ${unavailable} unavailable` : ''}`)
console.log('\nnext: node scripts/build-image-map.mjs')
if (collisions.length > 0) {
  console.log(`\n${collisions.length} duplicates entered the catalogue under a reworded name:`)
  for (const c of collisions) console.log(`  ${c}`)
}
