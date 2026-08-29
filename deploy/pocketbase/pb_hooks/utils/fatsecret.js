/// <reference path="../../pb_data/types.d.ts" />
/**
 * FatSecret Platform API client for the hooks, loaded with require() inside
 * each handler. Compliance is structural: every fetched recipe is written to
 * the `recipes` collection with fetchedAt, so the nightly job can honour the
 * "remove or replace within 24 hours" rule; only a real user request (or the
 * refresh of rows one brought in) ever triggers a call; a self-imposed daily
 * budget stops well below the 5,000-call cap.
 */

const TOKEN_URL = 'https://oauth.fatsecret.com/connect/token'
const SEARCH_URL = 'https://platform.fatsecret.com/rest/recipes/search/v3'
const RECIPE_URL = 'https://platform.fatsecret.com/rest/recipe/v2'
/* Exact strings live in fixtures/recipe-types.json (Task 0). Adjust if needed. */
const MAIN_TYPES = 'Main Dish'
const DAY_BUDGET = 4500

function enabled() {
  return !!($os.getenv('FATSECRET_CLIENT_ID') && $os.getenv('FATSECRET_CLIENT_SECRET'))
}

/* ASCII-only base64: enough for "client_id:client_secret". */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function b64(s) {
  let out = ''
  for (let i = 0; i < s.length; i += 3) {
    const a = s.charCodeAt(i)
    const b = i + 1 < s.length ? s.charCodeAt(i + 1) : NaN
    const c = i + 2 < s.length ? s.charCodeAt(i + 2) : NaN
    out += B64[a >> 2] + B64[((a & 3) << 4) | (isNaN(b) ? 0 : b >> 4)]
    out += isNaN(b) ? '=' : B64[((b & 15) << 2) | (isNaN(c) ? 0 : c >> 6)]
    out += isNaN(c) ? '=' : B64[c & 63]
  }
  return out
}

function cacheGet(app, key) {
  try {
    const row = app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: key })
    return JSON.parse(toString(row.get('value')))
  } catch {
    return null
  }
}

function cacheUpsert(app, key, value) {
  let row
  try {
    row = app.findFirstRecordByFilter('shared_cache', 'key = {:key}', { key: key })
  } catch {
    row = new Record(app.findCollectionByNameOrId('shared_cache'))
    row.set('key', key)
  }
  row.set('value', value)
  app.save(row)
}

/* Approximate counter is fine: a race loses one increment, and the budget
   sits 500 calls under the real cap precisely to absorb that. */
function quotaSpend(app, n) {
  const key = 'fs-quota-' + new Date().toISOString().slice(0, 10)
  const state = cacheGet(app, key) || { count: 0 }
  if (state.count + n > DAY_BUDGET) return false
  cacheUpsert(app, key, { count: state.count + n })
  return true
}

function token(app) {
  const cached = cacheGet(app, 'fs-token')
  if (cached && cached.exp > Date.now() / 1000 + 120) return cached.token
  const id = $os.getenv('FATSECRET_CLIENT_ID')
  const secret = $os.getenv('FATSECRET_CLIENT_SECRET')
  if (!id || !secret) return null
  const res = $http.send({
    url: TOKEN_URL,
    method: 'POST',
    body: 'grant_type=client_credentials&scope=basic',
    headers: {
      authorization: 'Basic ' + b64(id + ':' + secret),
      'content-type': 'application/x-www-form-urlencoded',
    },
    timeout: 15,
  })
  if (res.statusCode !== 200 || !res.json || !res.json.access_token) return null
  const tok = String(res.json.access_token)
  const exp = Date.now() / 1000 + (Number(res.json.expires_in) || 3600)
  cacheUpsert(app, 'fs-token', { token: tok, exp: exp })
  return tok
}

function callApi(app, url, params) {
  if (!quotaSpend(app, 1)) return null
  const tok = token(app)
  if (!tok) return null
  const qs = Object.keys(params)
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&')
  const res = $http.send({
    url: url + '?format=json&' + qs,
    headers: { authorization: 'Bearer ' + tok },
    timeout: 20,
  })
  return res.statusCode === 200 ? res.json : null
}

/* FatSecret collapses single-element arrays into bare objects. */
function toArray(v) {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}

/* Their numbers arrive as JSON strings. */
function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined
}

function text(v) {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

function typeToCategory(types) {
  const all = types.join(' ').toLowerCase()
  if (all.includes('breakfast')) return 'breakfast'
  if (all.includes('salad')) return 'salad'
  if (all.includes('soup') || all.includes('stew')) return 'soup'
  if (all.includes('side')) return 'side'
  if (all.includes('main') || all.includes('lunch') || all.includes('dinner')) return 'main'
  return 'other'
}

/** recipes.search.v3, images required. Returns recipe_id strings. */
function searchIds(app, opts) {
  const params = {
    must_have_images: 'true',
    recipe_types: opts.types || MAIN_TYPES,
    max_results: '20',
    page_number: String(opts.page || 0),
  }
  if (opts.maxKcal) {
    params['calories.to'] = String(opts.maxKcal)
    /* Their protein filter is % of calories; grams are enforced locally. */
    if (opts.minProteinG) {
      const pct = Math.min(90, Math.round((400 * opts.minProteinG) / opts.maxKcal))
      if (pct > 10) params['protein_percentage.from'] = String(pct)
    }
  }
  if (opts.minKcal) params['calories.from'] = String(opts.minKcal)
  const raw = callApi(app, SEARCH_URL, params)
  const entries = toArray(raw && raw.recipes && raw.recipes.recipe)
  const ids = []
  for (const r of entries) {
    const id =
      text(r && r.recipe_id) ||
      (typeof (r && r.recipe_id) === 'number' ? String(r.recipe_id) : undefined)
    if (id) ids.push(id)
  }
  return ids
}

/** recipe.get.v2 payload -> flat catalogue row, or null when malformed. */
function normalizeDetail(raw) {
  const r = raw && raw.recipe
  if (!r) return null
  const id = text(r.recipe_id) || (typeof r.recipe_id === 'number' ? String(r.recipe_id) : undefined)
  const title = text(r.recipe_name)
  const images = toArray(r.recipe_images && r.recipe_images.recipe_image)
    .map((i) => text(i))
    .filter(Boolean)
  const imageUrl = images[0]
  const serving = toArray(r.serving_sizes && r.serving_sizes.serving)[0]
  const directions = toArray(r.directions && r.directions.direction)
    .map((d) => text(d && d.direction_description))
    .filter(Boolean)
  const ingredients = toArray(r.ingredients && r.ingredients.ingredient)
    .map((i) => text(i && i.ingredient_description))
    .filter(Boolean)
  const types = toArray(r.recipe_types && r.recipe_types.recipe_type)
    .map((t) => text(t))
    .filter(Boolean)
  if (!id || !title || !imageUrl || !serving || directions.length === 0) return null
  const kcal = num(serving.calories)
  const proteinG = num(serving.protein)
  if (kcal === undefined || proteinG === undefined) return null
  const prep = num(r.preparation_time_min)
  const cook = num(r.cooking_time_min)
  return {
    provider: 'fatsecret',
    providerId: id,
    title: title,
    imageUrl: imageUrl,
    kcal: kcal,
    proteinG: proteinG,
    carbsG: num(serving.carbohydrate),
    fatG: num(serving.fat),
    servings: num(r.number_of_servings),
    readyInMinutes: prep !== undefined || cook !== undefined ? (prep || 0) + (cook || 0) : undefined,
    category: typeToCategory(types),
    sourceCategory: types.join(', '),
    directions: directions,
    ingredients: ingredients,
    sourceUrl: text(r.recipe_url),
  }
}

/** Fetch one recipe and upsert it with a fresh fetchedAt. */
function fetchAndStore(app, recipeId) {
  const raw = callApi(app, RECIPE_URL, { recipe_id: recipeId })
  const row = normalizeDetail(raw)
  if (!row) return null
  let rec
  try {
    rec = app.findFirstRecordByFilter('recipes', "provider = 'fatsecret' && providerId = {:pid}", {
      pid: row.providerId,
    })
  } catch {
    rec = new Record(app.findCollectionByNameOrId('recipes'))
  }
  for (const key of Object.keys(row)) rec.set(key, row[key] === undefined ? null : row[key])
  rec.set('fetchedAt', new Date().toISOString())
  app.save(rec)
  return rec
}

module.exports = {
  enabled: enabled,
  quotaSpend: quotaSpend,
  token: token,
  searchIds: searchIds,
  normalizeDetail: normalizeDetail,
  fetchAndStore: fetchAndStore,
  toArray: toArray,
  num: num,
  MAIN_TYPES: MAIN_TYPES,
  DAY_BUDGET: DAY_BUDGET,
}
