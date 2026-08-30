/// <reference path="../../pb_data/types.d.ts" />
/**
 * What a recipe must contain to be worth serving. The collection rules decide
 * WHO may write (platform admins, see the migration); this decides WHAT gets
 * through, so a half-filled dish never reaches a member's plan.
 *
 * Lives in utils/ because PocketBase runs each hook in an isolated VM: a
 * helper at a .pb.js top level is invisible inside the handler.
 */

const CATEGORIES = [
  'main',
  'breakfast',
  'salad',
  'soup',
  'side',
  'dessert',
  'drink',
  'snack',
  'other',
]

function validateRecipe(e) {
  const record = e.record
  const fail = (message) => {
    throw new BadRequestError(message)
  }

  const title = (record.getString('title') || '').trim()
  if (title.length < 2) fail('A recipe needs a name.')
  if (title.length > 300) fail('That name is too long.')

  const category = record.getString('category')
  if (!CATEGORIES.includes(category)) {
    fail('Pick a course: ' + CATEGORIES.join(', ') + '.')
  }

  /* A dish with no photo cannot be shown anywhere in the app, so it is not a
     dish yet. Either an uploaded file or a URL to one. */
  /* On a create request an uploaded file is not on the record yet: getString
     is still empty while get() holds the pending upload. Either that, an
     already-stored filename, or a URL counts as having a photo. */
  const rawImage = record.get('image')
  const hasStored = record.getString('image') !== ''
  const hasPending = rawImage !== null && rawImage !== undefined && typeof rawImage === 'object'
  const hasUrl = (record.getString('imageUrl') || '').trim() !== ''
  if (!hasStored && !hasPending && !hasUrl) fail('A recipe needs a photo.')

  const imported = record.getString('provider') === 'pd'

  const bounded = (field, label, max, mustExceedZero) => {
    const value = record.getFloat(field)
    if (mustExceedZero && !(value > 0)) fail(label + ' must be a number above zero.')
    if (value < 0) fail(label + ' cannot be negative.')
    if (value > max) fail(label + ' looks wrong: ' + value + '.')
  }
  bounded('kcal', 'Energy per serving', 5000, true)
  /* Protein may honestly be zero: a salsa, a dressing, a fruit slush. Only the
     energy has to be a real number for the plan maths to mean anything. */
  bounded('proteinG', 'Protein per serving', 500, false)
  /* The archive does not always state a yield. Our own recipes must, because
     whoever writes one knows it; an import is taken as it was published, and
     the portion maths already caps at three servings when it is unknown. */
  bounded('servings', 'Servings', 100, !imported)

  const list = (field, label, min) => {
    let parsed
    try {
      parsed = JSON.parse(toString(record.get(field)))
    } catch {
      fail(label + ' must be a list.')
    }
    if (!Array.isArray(parsed)) fail(label + ' must be a list.')
    const clean = parsed.filter((s) => typeof s === 'string' && s.trim().length > 0)
    if (clean.length < min) fail(label + ' needs at least ' + min + '.')
    /* Store the tidied list: no blank lines reaching the recipe page. */
    record.set(field, clean.map((s) => s.trim()))
  }
  list('directions', 'The method', 2)
  list('ingredients', 'The ingredients', 1)

  /* Written here, owned by us: never a vendor row on a 24h clock, and never
     silently claiming to be the public-domain import. */
  if (record.getString('provider') !== 'pd') record.set('provider', 'house')
  /* The record id does not exist yet on a create request, so the handle comes
     from the framework's own random source; the (provider, providerId) index
     is unique and two house recipes must never collide. */
  if (!record.getString('providerId')) {
    record.set('providerId', 'house-' + $security.randomString(12))
  }
}

module.exports = { validateRecipe: validateRecipe, CATEGORIES: CATEGORIES }
