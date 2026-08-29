/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 8: local-first recipe endpoints. The `recipes` collection answers
 * first; FatSecret is only called to top it up, and everything fetched is
 * stored so the next request is local. Suggestions are deterministic per
 * (date, targets) so every device converges without extra calls.
 */

routerAdd('GET', '/api/enforma/recipes/suggestions', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in to search recipes.' })
  const fs = require(`${__hooks}/utils/fatsecret.js`)
  const lib = require(`${__hooks}/utils/recipes_lib.js`)

  const q = e.request.url.query()
  const date = q.get('date') || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return e.json(400, { message: 'Bad date.' })
  const maxKcal = parseInt(q.get('maxKcal') || '', 10)
  const minProtein = parseInt(q.get('minProtein') || '', 10)
  const minKcal = parseInt(q.get('minKcal') || '', 10)
  if (!Number.isFinite(maxKcal) || maxKcal < 100 || maxKcal > 4000) {
    return e.json(400, { message: 'Bad maxKcal.' })
  }
  if (!Number.isFinite(minProtein) || minProtein < 0 || minProtein > 300) {
    return e.json(400, { message: 'Bad minProtein.' })
  }

  const window = {
    maxKcal: maxKcal,
    minProtein: minProtein,
    minKcal: Number.isFinite(minKcal) && minKcal > 0 ? minKcal : 0,
  }

  /* Coarse filter in SQL, exact selection in JS: a dish qualifies if some
     number of its servings lands in the window, and n >= 1 means a single
     serving can never exceed the ceiling, while n <= MAX_PORTIONS means the
     per-serving protein can never be below a third of the floor. */
  const localQuery = () => {
    const filter =
      "category = 'main' && kcal > 0 && kcal <= {:max} && proteinG >= {:minPer}" +
      " && (provider = 'pd' || fetchedAt >= {:cutoff})"
    const rows = $app.findRecordsByFilter(
      'recipes',
      filter,
      '-proteinG,providerId',
      200,
      0,
      {
        max: maxKcal,
        minPer: minProtein / lib.MAX_PORTIONS,
        cutoff: lib.freshCutoff(),
      },
    )
    const fitted = []
    for (const r of rows) {
      const portions = lib.portionsFor(
        r.getFloat('kcal'),
        r.getFloat('proteinG'),
        r.getFloat('servings'),
        window,
      )
      if (portions > 0) fitted.push({ record: r, portions: portions })
    }
    /* Most protein on the plate first, at the portions we are recommending. */
    fitted.sort((a, b) => b.record.getFloat('proteinG') * b.portions - a.record.getFloat('proteinG') * a.portions)
    return fitted
  }

  let rows = localQuery()

  /* Thin local pool: one bounded top-up, then ask the catalogue again. */
  if (rows.length < 6 && fs.enabled()) {
    const ids = fs.searchIds($app, {
      maxKcal: maxKcal,
      minKcal: Number.isFinite(minKcal) && minKcal > 0 ? minKcal : undefined,
      minProteinG: minProtein,
      page: lib.seedFrom(date) % 5,
    })
    let fetched = 0
    for (const id of ids) {
      if (fetched >= 12) break
      let fresh = false
      try {
        const existing = $app.findFirstRecordByFilter(
          'recipes',
          "provider = 'fatsecret' && providerId = {:pid}",
          { pid: id },
        )
        fresh =
          existing.getString('fetchedAt').replace(' ', 'T') >= lib.freshCutoff().replace(' ', 'T')
      } catch {
        /* Not stored yet. */
      }
      if (fresh) continue
      if (fs.fetchAndStore($app, id)) fetched++
    }
    rows = localQuery()
  }

  /* A seeded 3-dish window rotates the shortlist day to day. */
  const offset = rows.length > 3 ? lib.seedFrom(date) % (rows.length - 2) : 0
  const picked = rows.slice(offset, offset + 3)
  lib.touchUsed($app, picked.map((f) => f.record))
  return e.json(200, {
    items: picked.map((f) => {
      const dish = lib.dishFromRecord(f.record)
      dish.portions = f.portions
      return dish
    }),
  })
})

/**
 * One recipe by id, for the recipe page and its deep links. Public like the
 * daily dish: the catalogue is not personal data. A fatsecret row past its
 * 24 hours is treated as gone rather than served stale.
 */
routerAdd('GET', '/api/enforma/recipe/{id}', (e) => {
  const lib = require(`${__hooks}/utils/recipes_lib.js`)
  const id = e.request.pathValue('id')
  if (!id) return e.json(400, { message: 'No recipe asked for.' })
  let record
  try {
    record = $app.findRecordById('recipes', id)
  } catch {
    return e.json(404, { message: 'No such recipe.' })
  }
  if (record.getString('provider') === 'fatsecret') {
    const fetchedAt = record.getString('fetchedAt').replace(' ', 'T')
    if (!fetchedAt || fetchedAt < lib.freshCutoff().replace(' ', 'T')) {
      return e.json(404, { message: 'No such recipe.' })
    }
  }
  lib.touchUsed($app, [record])
  return e.json(200, lib.dishFromRecord(record))
})

routerAdd('GET', '/api/enforma/daily-dish', (e) => {
  const fs = require(`${__hooks}/utils/fatsecret.js`)
  const lib = require(`${__hooks}/utils/recipes_lib.js`)

  const date = e.request.url.query().get('date') || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return e.json(400, { message: 'Bad date.' })

  const cacheKey = 'dish-' + date
  const cached = lib.cacheGet($app, cacheKey)
  if (cached) return e.json(200, cached)

  const poolFor = (category) =>
    $app.findRecordsByFilter(
      'recipes',
      "category = {:cat} && (provider = 'pd' || fetchedAt >= {:cutoff})",
      'providerId',
      200,
      0,
      { cat: category, cutoff: lib.freshCutoff() },
    )

  const category = lib.DAILY_CATEGORIES[lib.seedFrom(date) % lib.DAILY_CATEGORIES.length]
  let pool = poolFor(category)
  if (pool.length === 0) pool = poolFor('main')

  /* Empty catalogue (first boot): seed a page of mains from FatSecret once. */
  if (pool.length === 0 && fs.enabled()) {
    const ids = fs.searchIds($app, { page: lib.seedFrom(date) % 10 })
    let fetched = 0
    for (const id of ids) {
      if (fetched >= 8) break
      if (fs.fetchAndStore($app, id)) fetched++
    }
    pool = poolFor('main')
  }
  if (pool.length === 0) return e.json(503, { message: 'No dishes on this server yet.' })

  const pick = pool[lib.seedFrom(date + category) % pool.length]
  lib.touchUsed($app, [pick])
  const dish = lib.dishFromRecord(pick)
  lib.cacheUpsert($app, cacheKey, dish)
  return e.json(200, dish)
})

/* The 24h compliance pass (see recipes_lib.maintain). 04:00 UTC keeps it off
   gym hours in Europe. The route below is the same body, for operators. */
cronAdd('recipesRefresh', '0 4 * * *', () => {
  const lib = require(`${__hooks}/utils/recipes_lib.js`)
  const result = lib.maintain($app)
  console.log('[recipes] maintenance', JSON.stringify(result))
})

routerAdd('POST', '/api/enforma/recipes/maintenance', (e) => {
  if (!e.hasSuperuserAuth()) return e.json(403, { message: 'Superusers only.' })
  const lib = require(`${__hooks}/utils/recipes_lib.js`)
  return e.json(200, lib.maintain($app))
})
