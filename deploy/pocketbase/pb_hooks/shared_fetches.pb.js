/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 7: the fetches every member used to make on their own device, made
 * once here instead. The MiniMax and Spoonacular keys live in this process's
 * environment and never reach a browser; results that are the same for
 * everyone (the daily dish, a day's recipe search) are cached in
 * `shared_cache` so one upstream call serves the whole gym.
 *
 * PocketBase runs each handler in an isolated VM: nothing at this file's top
 * level is visible inside them, so every helper is defined where it runs.
 *
 * `/api/enforma/capabilities` is how the app learns what this server can do —
 * the client shows AI-coach and recipe-search copy only when they are real.
 */

routerAdd('GET', '/api/enforma/capabilities', (e) => {
  return e.json(200, {
    coach: !!$os.getenv('MINIMAX_API_KEY'),
    recipes: !!$os.getenv('SPOONACULAR_API_KEY'),
    push: $os.getenv('VAPID_PUBLIC_KEY') || null,
  })
})

routerAdd('GET', '/api/enforma/daily-dish', (e) => {
  const cacheGet = (key) => {
    try {
      const row = $app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: key })
      return JSON.parse(toString(row.get('value')))
    } catch {
      return null
    }
  }
  const cacheSet = (key, value) => {
    try {
      const record = new Record($app.findCollectionByNameOrId('shared_cache'))
      record.set('key', key)
      record.set('value', value)
      $app.save(record)
    } catch {
      /* A concurrent request cached it first; theirs is as good as ours. */
    }
  }
  /* FNV-1a, bit-for-bit the client's seedFrom: both sides pick the same dish. */
  const seedFrom = (text) => {
    let h = 2166136261
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i)
      h = Math.imul(h, 16777619)
    }
    return h >>> 0
  }

  const date = e.request.url.query().get('date') || new Date().toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return e.json(400, { message: 'Bad date.' })

  const cacheKey = 'dish-' + date
  const cached = cacheGet(cacheKey)
  if (cached) return e.json(200, cached)

  const categories = ['Chicken', 'Seafood', 'Beef', 'Vegetarian', 'Pasta', 'Breakfast', 'Lamb', 'Pork']
  const nonPlate =
    /\b(pickle|pickled|sauce|dip|jam|chutney|relish|dressing|marinade|gravy|spread|syrup|cake|brownies?|cookies?|fudge|pudding|ice cream)\b/i

  const category = categories[seedFrom(date) % categories.length]
  const listRes = $http.send({
    url: 'https://www.themealdb.com/api/json/v1/1/filter.php?c=' + encodeURIComponent(category),
    timeout: 15,
  })
  if (listRes.statusCode !== 200) return e.json(502, { message: 'TheMealDB did not answer.' })
  const meals = (listRes.json || {}).meals || []
  const plates = meals.filter((m) => m && m.strMeal && !nonPlate.test(m.strMeal))
  if (plates.length === 0) return e.json(502, { message: 'No plates in the category today.' })

  const pick = plates[seedFrom(date + category) % plates.length]
  const detailRes = $http.send({
    url: 'https://www.themealdb.com/api/json/v1/1/lookup.php?i=' + encodeURIComponent(pick.idMeal),
    timeout: 15,
  })
  if (detailRes.statusCode !== 200) return e.json(502, { message: 'TheMealDB did not answer.' })
  const meal = ((detailRes.json || {}).meals || [])[0]
  if (!meal) return e.json(502, { message: 'Dish detail was empty.' })

  const dish = {
    id: String(meal.idMeal),
    source: 'mealdb',
    title: meal.strMeal,
    imageUrl: meal.strMealThumb,
    category: meal.strCategory || undefined,
    area: meal.strArea || undefined,
    sourceUrl:
      meal.strSource || meal.strYoutube || 'https://www.themealdb.com/meal/' + meal.idMeal,
  }
  cacheSet(cacheKey, dish)
  return e.json(200, dish)
})

routerAdd('POST', '/api/minimax/chat/completions', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in to use the coach.' })
  const key = $os.getenv('MINIMAX_API_KEY')
  if (!key) return e.json(503, { message: 'No coach on this server.' })
  const base = $os.getenv('MINIMAX_BASE_URL') || 'https://api.minimaxi.chat/v1'
  const res = $http.send({
    url: base + '/chat/completions',
    method: 'POST',
    body: readerToString(e.request.body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    timeout: 180,
  })
  return e.json(res.statusCode, res.json)
})

routerAdd('GET', '/api/recipes/spoonacular/recipes/complexSearch', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in to search recipes.' })
  const key = $os.getenv('SPOONACULAR_API_KEY')
  if (!key) return e.json(503, { message: 'No recipe search on this server.' })

  const cacheGet = (k) => {
    try {
      const row = $app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: k })
      return JSON.parse(toString(row.get('value')))
    } catch {
      return null
    }
  }
  const cacheSet = (k, value) => {
    try {
      const record = new Record($app.findCollectionByNameOrId('shared_cache'))
      record.set('key', k)
      record.set('value', value)
      $app.save(record)
    } catch {
      /* Concurrent fill: fine. */
    }
  }

  const query = e.request.url.rawQuery || ''
  const cacheKey = 'spoon-' + query
  const cached = cacheGet(cacheKey)
  if (cached) return e.json(200, cached)

  const res = $http.send({
    url: 'https://api.spoonacular.com/recipes/complexSearch?' + query,
    headers: { 'x-api-key': key },
    timeout: 20,
  })
  if (res.statusCode !== 200) return e.json(res.statusCode, res.json)
  cacheSet(cacheKey, res.json)
  return e.json(200, res.json)
})
