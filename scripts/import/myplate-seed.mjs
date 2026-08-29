#!/usr/bin/env node
/**
 * Seeds the `recipes` collection with the crawled public-domain MyPlate rows.
 * Idempotent: existing (pd, slug) rows are updated, not duplicated. Usage:
 *   PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
 *     node scripts/import/myplate-seed.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, 'out')
const PB = process.env.PB_URL || 'http://127.0.0.1:8090'

/**
 * The archived pages carry no course taxonomy (verified: no recipeCategory in
 * their JSON-LD and no facet markup), so the category is read off the title
 * the way the old TheMealDB `isPlate` filter read plates off names. It does
 * double duty: desserts, drinks and condiments land outside `main` and are
 * therefore never offered as a meal that fits someone's calorie plan.
 */
const CATEGORY_RULES = [
  ['drink', /\b(smoothie|punch|lemonade|juice|shake|cooler|tea|coffee|cocoa|agua fresca|horchata)\b/i],
  ['dessert', /\b(cake|cookies?|brownies?|pie|pudding|popsicles?|crisp|cobbler|fudge|candy|dessert|sorbet|ice cream|bars?)\b/i],
  ['soup', /\b(soup|stew|chili|chowder|bisque|gumbo|broth)\b/i],
  ['salad', /\b(salad|slaw|coleslaw)\b/i],
  ['breakfast', /\b(oatmeal|pancakes?|waffles?|muffins?|granola|breakfast|omelet|omelette|frittata|french toast|cereal|parfait|scrambled|porridge)\b/i],
  ['side', /\b(dip|salsa|sauce|dressing|spread|relish|chutney|jam|biscuits?|rolls?|bread|cornbread|side|snack|hummus|guacamole|pickles?)\b/i],
]

export function categoryFromTitle(title) {
  for (const [category, pattern] of CATEGORY_RULES) if (pattern.test(title)) return category
  return 'main'
}

async function main() {
  const auth = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: process.env.PB_SUPERUSER_EMAIL,
      password: process.env.PB_SUPERUSER_PASSWORD,
    }),
  }).then((r) => r.json())
  if (!auth.token) throw new Error('superuser auth failed: ' + JSON.stringify(auth))
  const headers = { authorization: auth.token }

  const recipes = JSON.parse(readFileSync(path.join(OUT, 'myplate.json'), 'utf8'))
  let created = 0
  let updated = 0
  let failed = 0
  for (const r of recipes) {
    const existing = await fetch(
      `${PB}/api/collections/recipes/records?filter=${encodeURIComponent(`provider='pd' && providerId='${r.slug}'`)}&perPage=1`,
      { headers },
    ).then((x) => x.json())

    const form = new FormData()
    form.set('provider', 'pd')
    form.set('providerId', r.slug)
    form.set('title', r.title)
    form.set('category', categoryFromTitle(r.title))
    form.set('sourceCategory', (r.courses || []).join(', '))
    if (r.kcal !== undefined) form.set('kcal', String(r.kcal))
    if (r.proteinG !== undefined) form.set('proteinG', String(r.proteinG))
    if (r.carbsG !== undefined) form.set('carbsG', String(r.carbsG))
    if (r.fatG !== undefined) form.set('fatG', String(r.fatG))
    if (r.servings !== undefined) form.set('servings', String(r.servings))
    form.set('directions', JSON.stringify(r.directions))
    form.set('ingredients', JSON.stringify(r.ingredients))
    form.set('sourceUrl', r.sourceUrl)
    const img = readFileSync(path.join(OUT, 'images', r.imageFile))
    form.set('image', new Blob([img], { type: 'image/jpeg' }), r.imageFile)

    const hit = existing.items && existing.items[0]
    const res = await fetch(
      hit
        ? `${PB}/api/collections/recipes/records/${hit.id}`
        : `${PB}/api/collections/recipes/records`,
      { method: hit ? 'PATCH' : 'POST', headers, body: form },
    )
    if (!res.ok) {
      console.log(`  FAILED ${r.slug}: ${res.status} ${await res.text()}`)
      failed++
      continue
    }
    if (hit) updated++
    else created++
  }
  console.log(`Seed done: ${created} created, ${updated} updated, ${failed} failed of ${recipes.length}.`)
}

if (process.argv[1] && process.argv[1].endsWith('myplate-seed.mjs')) await main()
