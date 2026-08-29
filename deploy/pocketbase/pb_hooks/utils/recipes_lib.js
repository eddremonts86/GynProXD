/// <reference path="../../pb_data/types.d.ts" />
/**
 * Shared helpers for the recipe endpoints. The client consumes exactly the
 * shape dishFromRecord returns; src/lib/recipes.ts parseDish is its mirror.
 */

/* FNV-1a, bit-for-bit the client's seedFrom: both sides pick the same dish. */
function seedFrom(text) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/* The daily dish rotates over these normalized categories. */
const DAILY_CATEGORIES = ['main', 'breakfast', 'salad', 'soup', 'side']

/** fatsecret rows older than this must not be served (their 24h rule). */
function freshCutoff() {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString().replace('T', ' ')
}

function jsonField(record, name) {
  try {
    const parsed = JSON.parse(toString(record.get(name)))
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string' && s.length > 0) : []
  } catch {
    return []
  }
}

function numField(record, name) {
  const v = record.getFloat(name)
  return v > 0 ? v : undefined
}

function dishFromRecord(record) {
  const file = record.getString('image')
  return {
    id: record.id,
    provider: record.getString('provider'),
    title: record.getString('title'),
    imageUrl: file
      ? '/pb/api/files/recipes/' + record.id + '/' + file
      : record.getString('imageUrl'),
    kcal: numField(record, 'kcal'),
    proteinG: numField(record, 'proteinG'),
    readyInMinutes: numField(record, 'readyInMinutes'),
    category: record.getString('sourceCategory') || record.getString('category') || undefined,
    directions: jsonField(record, 'directions'),
    ingredients: jsonField(record, 'ingredients'),
    sourceUrl: record.getString('sourceUrl') || undefined,
  }
}

function touchUsed(app, records) {
  const now = new Date().toISOString()
  for (const r of records) {
    try {
      r.set('usedAt', now)
      app.save(r)
    } catch {
      /* Bookkeeping only; serving matters more. */
    }
  }
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

/**
 * Nightly compliance pass. FatSecret rows older than 24h are re-requested
 * when a member used them in the last 7 days (bounded), deleted otherwise.
 * Old shared_cache entries (daily dishes, legacy spoonacular payloads) are
 * purged after 3 days.
 */
function maintain(app) {
  const fs = require(`${__hooks}/utils/fatsecret.js`)
  const REFRESH_CAP = 300
  const cutoff = freshCutoff()
  const keepAfter = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().replace('T', ' ')
  const stale = app.findRecordsByFilter(
    'recipes',
    "provider = 'fatsecret' && fetchedAt < {:cutoff}",
    'fetchedAt',
    1000,
    0,
    { cutoff: cutoff },
  )
  let refreshed = 0
  let deleted = 0
  for (const r of stale) {
    const used = r.getString('usedAt')
    const keep = used !== '' && used >= keepAfter
    if (keep && refreshed < REFRESH_CAP && fs.enabled()) {
      const ok = fs.fetchAndStore(app, r.getString('providerId'))
      if (ok) {
        refreshed++
        continue
      }
    }
    app.delete(r)
    deleted++
  }
  const oldKeys = app.findRecordsByFilter(
    'shared_cache',
    "(key ~ 'dish-' || key ~ 'spoon-' || key ~ 'fs-quota-') && created < {:old}",
    '',
    500,
    0,
    { old: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString().replace('T', ' ') },
  )
  for (const row of oldKeys) app.delete(row)
  return { stale: stale.length, refreshed: refreshed, deleted: deleted, purgedCache: oldKeys.length }
}

module.exports = {
  seedFrom: seedFrom,
  DAILY_CATEGORIES: DAILY_CATEGORIES,
  freshCutoff: freshCutoff,
  dishFromRecord: dishFromRecord,
  touchUsed: touchUsed,
  cacheGet: cacheGet,
  cacheUpsert: cacheUpsert,
  maintain: maintain,
}
