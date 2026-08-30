#!/usr/bin/env node
/**
 * One-time crawl of the retired USDA MyPlate Kitchen (public domain, 17 USC
 * §105) from the Internet Archive. Polite by construction: sequential, one
 * request per 1.5s, resumable via out/state.json. Usage:
 *   node scripts/import/myplate-crawl.mjs [--limit N]
 */
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, 'out')
const IMAGES = path.join(OUT, 'images')
const STATE = path.join(OUT, 'state.json')
const RESULT = path.join(OUT, 'myplate.json')
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i > -1 ? Number(process.argv[i + 1]) : Infinity
})()
/* Snapshots live under both hosts; query each and merge on slug. */
const CDX_HOSTS = ['myplate.gov', 'www.myplate.gov'].map(
  (host) =>
    `https://web.archive.org/cdx/search/cdx?url=${host}/recipes/*&output=json` +
    '&filter=statuscode:200&filter=mimetype:text/html&collapse=urlkey&fl=original,timestamp&limit=8000',
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(url, asBuffer = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'enForma-pd-import/1.0' } })
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`)
      if (!res.ok) return null
      return asBuffer ? Buffer.from(await res.arrayBuffer()) : await res.text()
    } catch (err) {
      console.log(`  retry ${attempt + 1} for ${url}: ${err.message}`)
      await sleep(5000 * (attempt + 1))
    }
  }
  return null
}

/** Only real recipe pages: /recipes/<program>/<slug> or /recipes/<slug>. */
function isRecipeUrl(u) {
  try {
    const { pathname, search } = new URL(u)
    if (search) return false
    const parts = pathname.split('/').filter(Boolean)
    if (parts[0] !== 'recipes' || parts.length < 2 || parts.length > 3) return false
    const last = parts[parts.length - 1]
    return /^[a-z0-9][a-z0-9-]*$/.test(last) && !['search', 'browse'].includes(last)
  } catch {
    return false
  }
}

function decode(s) {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Every list item inside one Drupal field block. Recipes with sub-components
 * ("Pancakes", then "Sauce") split their items across several lists, and the
 * first of those lists is sometimes empty, so taking a single <ul> loses them.
 * The block runs from the field marker to wherever the next field begins.
 */
function fieldItems(html, name) {
  const start = html.search(new RegExp(`field--name-field-(?:mp-)?${name}`))
  if (start === -1) return []
  const rest = html.slice(start + 1)
  const next = rest.search(/field--name-field-/)
  const block = next === -1 ? rest : rest.slice(0, next)
  return [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)]
    .map((m) => decode(m[1]))
    .filter(Boolean)
}

/** JSON-LD Recipe first; the Drupal field markup as fallback. */
function parsePage(html, sourceUrl) {
  let ld = null
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const parsed = JSON.parse(m[1])
      const nodes = Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed]
      ld = nodes.find((n) => n && n['@type'] === 'Recipe') || ld
    } catch {
      /* Malformed block: keep looking. */
    }
  }
  const title =
    (ld && typeof ld.name === 'string' && ld.name.trim()) ||
    decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '')
  if (!title) return null

  const listFrom = (v) =>
    (Array.isArray(v) ? v : typeof v === 'string' ? [v] : v ? [v] : [])
      .map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : ''))
      .map((s) => decode(s))
      .filter(Boolean)

  let directions = ld ? listFrom(ld.recipeInstructions) : []
  let ingredients = ld ? listFrom(ld.recipeIngredient) : []
  if (directions.length === 0) directions = fieldItems(html, 'instructions')
  if (ingredients.length === 0) ingredients = fieldItems(html, 'ingredients')
  if (directions.length === 0) return null

  const nutriNum = (label) => {
    const ldKey = {
      'Total Calories': 'calories',
      Protein: 'proteinContent',
      Carbohydrates: 'carbohydrateContent',
      'Total Fat': 'fatContent',
    }[label]
    const fromLd = ld && ld.nutrition && ld.nutrition[ldKey]
    const source =
      typeof fromLd === 'string' || typeof fromLd === 'number'
        ? fromLd
        : (html.match(new RegExp(`>\\s*${label}\\s*<[\\s\\S]{0,200}?([\\d.]+)`)) || [])[1]
    const n = parseFloat(String(source))
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined
  }

  const servings = (() => {
    const fromLd = ld && (ld.recipeYield || ld.yield)
    const m = String(
      fromLd || (html.match(/>\s*(?:Makes|Serves|Servings?)[:\s<][\s\S]{0,80}?(\d+)/i) || [])[1] || '',
    )
    const n = parseInt(m.match(/\d+/)?.[0] || '', 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
  })()

  const courses = ld
    ? listFrom(ld.recipeCategory)
    : [...html.matchAll(/recipes\?f%5B\d%5D=course[^"]*"[^>]*>([^<]+)</g)].map((m) => decode(m[1]))

  const image =
    (ld &&
      (typeof ld.image === 'string'
        ? ld.image
        : Array.isArray(ld.image)
          ? ld.image[0]
          : ld.image && ld.image.url)) ||
    (html.match(/property="og:image" content="([^"]+)"/) || [])[1]

  return {
    title,
    directions,
    ingredients,
    kcal: nutriNum('Total Calories'),
    proteinG: nutriNum('Protein'),
    carbsG: nutriNum('Carbohydrates'),
    fatG: nutriNum('Total Fat'),
    servings,
    courses,
    image: typeof image === 'string' ? image : undefined,
    sourceUrl,
  }
}

async function main() {
  mkdirSync(IMAGES, { recursive: true })
  const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : { done: {} }
  const results = existsSync(RESULT) ? JSON.parse(readFileSync(RESULT, 'utf8')) : []

  console.log('Fetching CDX indexes…')
  const bySlug = new Map()
  for (const cdxUrl of CDX_HOSTS) {
    const raw = await get(cdxUrl)
    if (!raw) continue
    const cdx = JSON.parse(raw)
    for (const [original, timestamp] of cdx.slice(1)) {
      if (!isRecipeUrl(original)) continue
      const slug = new URL(original).pathname.split('/').filter(Boolean).pop()
      if (!bySlug.has(slug)) bySlug.set(slug, { original, timestamp })
    }
    await sleep(1500)
  }
  const pages = [...bySlug.values()]
  console.log(`${pages.length} recipe pages in the archive index`)

  let processed = 0
  for (const page of pages) {
    if (processed >= LIMIT) break
    const slug = new URL(page.original).pathname.split('/').filter(Boolean).pop()
    if (state.done[slug]) continue
    processed++
    await sleep(1500)
    const html = await get(`https://web.archive.org/web/${page.timestamp}id_/${page.original}`)
    if (!html) {
      state.done[slug] = 'fetch-failed'
      continue
    }
    const recipe = parsePage(html, `https://web.archive.org/web/${page.timestamp}/${page.original}`)
    if (!recipe || recipe.kcal === undefined || recipe.proteinG === undefined) {
      state.done[slug] = 'parse-failed'
      console.log(`  skip ${slug} (parse or nutrition missing)`)
      continue
    }
    let imageFile = null
    if (recipe.image) {
      await sleep(1500)
      const buf = await get(`https://web.archive.org/web/${page.timestamp}im_/${recipe.image}`, true)
      if (buf && buf.length > 2000) {
        imageFile = `${slug}.jpg`
        writeFileSync(path.join(IMAGES, imageFile), buf)
      }
    }
    if (!imageFile) {
      state.done[slug] = 'no-image'
      console.log(`  skip ${slug} (no usable photo)`)
      continue
    }
    results.push({ slug, ...recipe, image: undefined, imageFile })
    state.done[slug] = 'ok'
    writeFileSync(RESULT, JSON.stringify(results, null, 1))
    writeFileSync(STATE, JSON.stringify(state))
    console.log(`  ok ${slug} (${results.length} total)`)
  }
  console.log(`Done. ${results.length} recipes with photo + nutrition.`)
}

await main()
