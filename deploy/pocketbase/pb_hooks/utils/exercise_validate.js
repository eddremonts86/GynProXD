/// <reference path="../../pb_data/types.d.ts" />
/**
 * What a movement has to be before it reaches anybody's session.
 *
 * The collection rules already say who may write; this says what. The same
 * checks run on create and on update, because an edit can empty a field just
 * as easily as a bad create can — and a published movement with no name is
 * worse than no movement, since it lands in a search box and a planner.
 */

const MUSCLES = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'other',
]

const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'bodyweight',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'other',
]

const CATEGORIES = ['strength', 'stretching', 'cardio', 'plyometrics', 'strongman', 'olympic']

const MAX_STEPS = 30
const MAX_STEP = 600

function fail(message) {
  throw new BadRequestError(message)
}

function validateExercise(e) {
  const record = e.record

  const name = (record.getString('name') || '').trim()
  if (name.length < 2) fail('A movement needs a name.')
  if (name.length > 120) fail('That name is too long for a card.')
  record.set('name', name)

  if (MUSCLES.indexOf(record.getString('muscle')) === -1) fail('Unknown muscle group.')
  if (EQUIPMENT.indexOf(record.getString('equipment')) === -1) fail('Unknown equipment.')
  if (CATEGORIES.indexOf(record.getString('category')) === -1) fail('Unknown category.')

  /* Instructions arrive as JSON from the panel and as whatever anyone else
     sends. Normalised here so the app can trust `string[]` and render it
     without checking every element.

     Through `toString` rather than straight off `record.get`: a json field
     comes back from Go as a value whose elements are not JS strings, so the
     obvious `typeof step === 'string'` rejects a perfectly good list. Same
     idiom as recipe_validate.js, and for the same reason. */
  let steps
  try {
    steps = JSON.parse(toString(record.get('instructions')) || '[]')
  } catch {
    fail('Instructions must be a list of steps.')
  }
  if (steps === null || steps === undefined) steps = []
  if (!Array.isArray(steps)) fail('Instructions must be a list of steps.')
  if (steps.length > MAX_STEPS) fail('That is more steps than anybody reads mid-set.')

  const cleaned = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    if (typeof step !== 'string') fail('Every instruction step has to be text.')
    const trimmed = step.trim()
    if (trimmed.length === 0) continue
    if (trimmed.length > MAX_STEP) fail('One of those steps is longer than a paragraph.')
    cleaned.push(trimmed)
  }
  record.set('instructions', cleaned)

  /* Published is a promise to a member that the row is finished. A movement
     nobody can be shown how to do has not earned it. */
  if (record.getBool('published') && cleaned.length === 0) {
    fail('Write at least one instruction step before publishing.')
  }
}

module.exports = { validateExercise, MUSCLES, EQUIPMENT, CATEGORIES }
