#!/usr/bin/env node
/**
 * Task 0 verification: proves the FatSecret credentials work, that the free
 * Basic tier really serves recipes, and that the hook's parser agrees with a
 * live payload. Records the responses under deploy/pocketbase/fixtures/
 * (gitignored — their terms forbid keeping their content around).
 * Reads .env.local; never prints the secret. Usage:
 *   node scripts/import/fatsecret-fixtures.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..', '..')
const FIXTURES = path.join(ROOT, 'deploy', 'pocketbase', 'fixtures')

function env() {
  let raw = ''
  try {
    raw = readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  } catch {
    throw new Error('No .env.local found at the repo root.')
  }
  const out = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

const step = (n, msg) => console.log(`\n[${n}] ${msg}`)

async function main() {
  const e = env()
  const id = e.FATSECRET_CLIENT_ID
  const secret = e.FATSECRET_CLIENT_SECRET
  if (!id || !secret) {
    console.log('FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET are not in .env.local yet.')
    process.exit(1)
  }
  console.log(`Using client id …${id.slice(-4)} (secret hidden, ${secret.length} chars).`)
  mkdirSync(FIXTURES, { recursive: true })

  step(1, 'Requesting an OAuth2 token (this is the call that needs a whitelisted IP)…')
  const tokenRes = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
  })
  const tokenBody = await tokenRes.text()
  if (!tokenRes.ok) {
    console.log(`  FAILED ${tokenRes.status}: ${tokenBody.slice(0, 300)}`)
    console.log('  401/invalid_client here usually means this machine\'s IP is not whitelisted.')
    process.exit(1)
  }
  const token = JSON.parse(tokenBody).access_token
  writeFileSync(path.join(FIXTURES, 'token.json'), JSON.stringify({ ok: true, expires_in: JSON.parse(tokenBody).expires_in }, null, 1))
  console.log(`  OK — token acquired, expires in ${JSON.parse(tokenBody).expires_in}s.`)

  const call = async (name, url) => {
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
    const text = await res.text()
    writeFileSync(path.join(FIXTURES, `${name}.json`), text)
    if (!res.ok) {
      console.log(`  FAILED ${res.status}: ${text.slice(0, 300)}`)
      return null
    }
    try {
      return JSON.parse(text)
    } catch {
      console.log(`  Response was not JSON: ${text.slice(0, 200)}`)
      return null
    }
  }

  step(2, 'Fetching the recipe_types taxonomy (confirms the exact category strings)…')
  const types = await call('recipe-types', 'https://platform.fatsecret.com/rest/recipe-types/v2?format=json')
  const typeList = types && types.recipe_types && types.recipe_types.recipe_type
  if (typeList) console.log('  Types:', (Array.isArray(typeList) ? typeList : [typeList]).join(', '))

  step(3, 'Searching recipes (confirms the Basic tier serves recipes at all)…')
  const search = await call(
    'search',
    'https://platform.fatsecret.com/rest/recipes/search/v3?format=json&must_have_images=true&recipe_types=Main%20Dish&calories.to=700&max_results=5',
  )
  const found = search && search.recipes && search.recipes.recipe
  const list = found ? (Array.isArray(found) ? found : [found]) : []
  if (list.length === 0) {
    console.log('  No recipes returned — see fixtures/search.json. If this is a permission error,')
    console.log('  the Basic tier does not include recipes and the plan falls back to MyPlate only.')
    process.exit(1)
  }
  console.log(`  OK — ${list.length} recipes. First: "${list[0].recipe_name}" (id ${list[0].recipe_id})`)

  step(4, 'Fetching one full recipe (confirms directions + per-serving nutrition)…')
  const detail = await call('recipe', `https://platform.fatsecret.com/rest/recipe/v2?format=json&recipe_id=${list[0].recipe_id}`)
  if (!detail) process.exit(1)

  step(5, 'Running the hook parser against that live payload…')
  const { writeFileSync: wf } = await import('node:fs')
  const hookSrc = readFileSync(path.join(ROOT, 'deploy/pocketbase/pb_hooks/utils/fatsecret.js'), 'utf8')
  const tmp = path.join(FIXTURES, 'fatsecret_parser.cjs')
  wf(tmp, hookSrc)
  globalThis.$os = { getenv: () => '' }
  globalThis.$http = { send: () => ({ statusCode: 500 }) }
  globalThis.toString = (v) => String(v)
  globalThis.Record = class {}
  const { createRequire } = await import('node:module')
  const req = createRequire(import.meta.url)
  const row = req(tmp).normalizeDetail(detail)
  if (!row) {
    console.log('  PARSER RETURNED NULL — the live shape differs from the documented one.')
    console.log('  Inspect deploy/pocketbase/fixtures/recipe.json and adjust normalizeDetail.')
    process.exit(1)
  }
  console.log('  OK — parsed:', JSON.stringify({
    title: row.title, kcal: row.kcal, proteinG: row.proteinG, category: row.category,
    sourceCategory: row.sourceCategory, steps: row.directions.length,
    ingredients: row.ingredients.length, image: row.imageUrl ? 'yes' : 'MISSING',
    readyInMinutes: row.readyInMinutes, servings: row.servings,
  }, null, 1))

  console.log('\nAll four Task 0 checks passed. Fixtures in deploy/pocketbase/fixtures/ (gitignored).')
}

await main()
