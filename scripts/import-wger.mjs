#!/usr/bin/env node
/**
 * Imports the wger exercise database — and keeps it at arm's length on purpose.
 *
 * wger's content is CC-BY-SA (713 movements under 4.0, 128 under 3.0, 21 CC0),
 * which is share-alike: adapt it and the adaptation inherits the licence. Merged
 * into `src/data/exercises-generated.ts` that would make one derived database
 * out of the whole catalogue, and two things would follow. Our own curation —
 * the alias table, the muscle and equipment mappings, the category work — would
 * go out under CC-BY-SA with it. And, fatally, share-alike obliges us to let
 * anyone redistribute what is in that file, which is a promise we have no right
 * to make about RepDB's rows: their licence forbids redistribution as a dataset.
 * The two cannot share a file.
 *
 * So they do not. This script writes its own pair of files, every row carries
 * the name of the person who wrote it and the licence it came under, and
 * `scripts/import-exercises.mjs` never reads either one.
 *
 *   src/data/exercises-wger-generated.ts  names, muscles, equipment, credit
 *   src/data/exercise-wger-text.json      the descriptions, loaded on demand
 *
 * Run: node scripts/import-wger.mjs
 */

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const API = 'https://wger.de/api/v2'
const ENGLISH = 2
const SPANISH = 4

/* ---------------------------------------------------------------- vocabulary */

/** wger names muscles anatomically and carries an `name_en` for most of them. */
const MUSCLE = {
  'Anterior deltoid': 'shoulders',
  'Biceps brachii': 'biceps',
  'Biceps femoris': 'hamstrings',
  Brachialis: 'biceps',
  Gastrocnemius: 'calves',
  'Gluteus maximus': 'glutes',
  'Latissimus dorsi': 'back',
  'Obliquus externus abdominis': 'core',
  'Pectoralis major': 'chest',
  'Quadriceps femoris': 'quads',
  'Rectus abdominis': 'core',
  'Serratus anterior': 'core',
  Soleus: 'calves',
  Trapezius: 'back',
  'Triceps brachii': 'triceps',
}

/** Used when a movement lists no primary muscle, which many of theirs do not. */
const CATEGORY_MUSCLE = {
  Abs: 'core',
  Arms: 'biceps',
  Back: 'back',
  Calves: 'calves',
  Cardio: 'other',
  Chest: 'chest',
  Legs: 'quads',
  Shoulders: 'shoulders',
}

/**
 * A bench is furniture, not an implement: somebody who said "dumbbells only"
 * still owns a bench, and filtering them out of incline work would be wrong.
 * Only the thing that supplies the resistance decides the bucket.
 */
const EQUIPMENT = {
  Barbell: 'barbell',
  'SZ-Bar': 'barbell',
  Dumbbell: 'dumbbell',
  Kettlebell: 'kettlebell',
  'Cable machine': 'cable',
  'Resistance band': 'band',
  'Pull-up bar': 'bodyweight',
  'none (bodyweight exercise)': 'bodyweight',
  Bench: 'bodyweight',
  'Incline bench': 'bodyweight',
  'Gym mat': 'bodyweight',
  'Swiss Ball': 'other',
}

const CATEGORY = {
  Abs: 'strength',
  Arms: 'strength',
  Back: 'strength',
  Calves: 'strength',
  Cardio: 'cardio',
  Chest: 'strength',
  Legs: 'strength',
  Shoulders: 'strength',
}

/* ------------------------------------------------------------------ helpers */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&rsquo;': '’',
}

/** Marks a block boundary while the tags are being stripped. */
const BREAK = '[[block]]'

/**
 * wger descriptions are HTML written by its contributors — a public wiki, which
 * makes them untrusted input. Rather than sanitise at render time and hope, the
 * markup is flattened to plain steps here, once, so nothing but text ever
 * reaches the app.
 *
 * Only a closing block tag or an explicit `<br>` starts a new step. The raw
 * newlines in the source are soft wraps from whoever typed the description —
 * treating them as boundaries cut sentences in three ("Begin in a half kneeling
 * position with the" / "leg away from the wall stabilized against the") — so
 * they collapse to spaces like any other whitespace.
 */
function toSteps(html) {
  if (!html) return []
  return html
    .replace(/\s+/g, ' ')
    .replace(/<\/(p|li|div|h[1-6])>/gi, BREAK)
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<[^>]+>/g, '')
    .split(BREAK)
    .map((block) =>
      block
        .replace(/&#?\w+;/g, (m) => ENTITIES[m.toLowerCase()] ?? ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((block) => block.length > 1)
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`)
  return res.json()
}

/** Walks a paginated wger endpoint to the end. */
async function fetchAll(endpoint) {
  const rows = []
  for (let url = `${API}/${endpoint}${endpoint.includes('?') ? '&' : '?'}format=json&limit=200`; url; ) {
    const page = await fetchJson(url)
    rows.push(...page.results)
    url = page.next
  }
  return rows
}

/* -------------------------------------------------------------------- import */

const [info, images] = await Promise.all([fetchAll('exerciseinfo/'), fetchAll('exerciseimage/')])

/** The main image per movement, hot-linked from wger rather than copied here. */
const imageFor = new Map()
for (const image of images) {
  if (!imageFor.has(image.exercise) || image.is_main) imageFor.set(image.exercise, image.image)
}

/* Our own catalogue, so the same movement is not offered twice under two
   licences. Read from the generated file rather than re-fetched: this script
   must never touch the upstreams that own it. */
const source = await readFile(path.join(ROOT, 'src/data/exercises-generated.ts'), 'utf8')
const existing = JSON.parse(source.slice(source.indexOf('= [') + 2, source.lastIndexOf(']') + 1))
const taken = new Set(
  existing.map((e) =>
    e.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim(),
  ),
)
const flatten = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const exercises = []
const text = {}
let skippedDuplicate = 0
let skippedUntranslated = 0

for (const row of info) {
  const english = row.translations?.find((t) => t.language === ENGLISH)
  if (!english?.name) {
    skippedUntranslated += 1
    continue
  }
  if (taken.has(flatten(english.name))) {
    skippedDuplicate += 1
    continue
  }
  taken.add(flatten(english.name))

  const spanish = row.translations?.find((t) => t.language === SPANISH)
  const primary = row.muscles?.[0]?.name
  const steps = toSteps(english.description)

  /* `wger-` prefixed so an id in somebody's logged workout says where it came
     from, and can never collide with the two catalogues. */
  exercises.push({
    id: `wger-${row.id}`,
    name: english.name,
    muscle: MUSCLE[primary] ?? CATEGORY_MUSCLE[row.category?.name] ?? 'other',
    equipment: EQUIPMENT[row.equipment?.[0]?.name] ?? 'bodyweight',
    category: CATEGORY[row.category?.name] ?? 'strength',
    image: imageFor.get(row.id) ?? null,
    /* The credit travels with the row: share-alike is per work, and the person
       who wrote this description is not the person who wrote the next one. */
    licenseAuthor: english.license_author || row.license_author || 'wger contributors',
    license: row.license?.short_name ?? 'CC-BY-SA 4',
    /* wger still returns the CC0 deed over plain http. The credit is a link on
       an https page, so upgrade it rather than ship a mixed-scheme anchor. */
    licenseUrl: (row.license?.url ?? 'https://creativecommons.org/licenses/by-sa/4.0/').replace(
      /^http:\/\//,
      'https://',
    ),
  })

  const es = toSteps(spanish?.description)
  if (steps.length > 0 || es.length > 0) {
    text[`wger-${row.id}`] = { en: steps, ...(es.length > 0 ? { es } : {}) }
  }
  /* Which languages exist is a fact about the row and belongs with the row:
     the language picker can then offer Spanish without first downloading half
     a megabyte to find out whether there is any. */
  const languages = [...(steps.length > 0 ? ['en'] : []), ...(es.length > 0 ? ['es'] : [])]
  exercises[exercises.length - 1].languages = languages
}

exercises.sort((a, b) => a.name.localeCompare(b.name))

await writeFile(
  path.join(ROOT, 'src/data/exercises-wger-generated.ts'),
  `import type { WgerExercise } from '../lib/types'

/* Generated by scripts/import-wger.mjs. CC-BY-SA; see ATTRIBUTION.md.
   Never merge this into exercises-generated.ts — share-alike would follow. */
export const wgerExercises: WgerExercise[] = ${JSON.stringify(exercises, null, 2)}
`,
)

const sortedText = Object.fromEntries(Object.entries(text).sort(([a], [b]) => a.localeCompare(b)))
await writeFile(
  path.join(ROOT, 'src/data/exercise-wger-text.json'),
  `${JSON.stringify(sortedText, null, 2)}\n`,
)

/* Its own stats file: catalogue-stats.ts belongs to import-exercises.mjs and
   would be overwritten by the next run of it. */
await writeFile(
  path.join(ROOT, 'src/data/wger-stats.ts'),
  `/* Generated by scripts/import-wger.mjs. Do not edit. */

export const WGER_SIZE = ${exercises.length}
export const WGER_TRANSLATED_ES = ${Object.values(text).filter((t) => t.es).length}
`,
)

const withSpanish = Object.values(sortedText).filter((t) => t.es).length
const licences = exercises.reduce((acc, e) => ({ ...acc, [e.license]: (acc[e.license] ?? 0) + 1 }), {})

console.log(`${exercises.length} wger movements written`)
console.log(`  ${skippedDuplicate} skipped, already in the catalogue under another licence`)
console.log(`  ${skippedUntranslated} skipped, no English name`)
console.log(`  ${Object.keys(sortedText).length} with a description, ${withSpanish} of them in Spanish`)
console.log(`  ${exercises.filter((e) => e.image).length} with an image, hot-linked from wger`)
console.log(`  licences: ${Object.entries(licences).map(([k, v]) => `${v} ${k}`).join(', ')}`)
