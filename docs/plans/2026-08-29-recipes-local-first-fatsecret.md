# Local-First Recipe Catalogue (FatSecret + Public Domain) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Implementation notes (2026-08-29, branch `feat/recipes-local-first`).**
> Phase A is implemented and verified against a local PocketBase 0.40.1
> (`deploy/pocketbase/.local`, port 8091); Phase B's crawler and seeder are
> implemented and proven on real archived pages. Deviations from the plan as
> written, all found by running it:
>
> - **The archived MyPlate pages carry no course taxonomy** — no
>   `recipeCategory` in their JSON-LD, no facet markup (verified on
>   20-minute-chicken-creole). `myplate-seed.mjs` therefore derives the
>   category from the title with a keyword table, which also does the job the
>   old TheMealDB `isPlate` filter did: desserts, drinks and condiments land
>   outside `main` and are never offered as a meal that fits a calorie plan.
> - **The archive holds 1,241 recipe pages**, not the ~1,072 estimated.
> - The repo's `package.json` sets `"type": "module"`, so the CommonJS hook
>   modules cannot be require()d by a Node test harness directly (PocketBase's
>   own JSVM is unaffected). Verification copies them to `.cjs` first.
> - Task 4's throwaway member is created with `verified: true`.
> - Task 0 (FatSecret signup, fixtures, IP whitelist) is still outstanding, so
>   the vendor top-up path is implemented and syntax/unit-checked but not yet
>   exercised against the live API. Everything else runs on real data.

**Goal:** Replace TheMealDB + Spoonacular with the app's own recipe catalogue in PocketBase — public-domain rows (USDA MyPlate) owned forever, FatSecret rows as a ToS-compliant 24h rolling cache — so the external API is only a fallback when local data cannot answer.

**Architecture:** A new `recipes` collection is the single catalogue behind three server endpoints (`daily-dish`, `recipes/suggestions`, plus a maintenance job). Every FatSecret fetch is stored and served locally for up to 24 hours; a nightly job refreshes recently-used rows and deletes the rest (FatSecret's terms make only IDs storable indefinitely). The permanent replica the product wants is built from USDA MyPlate content (public domain, 17 USC §105) imported once from the Internet Archive. The browser never talks to a recipe vendor again; the client consumes one normalized dish shape and gains in-app preparation steps.

**Tech Stack:** PocketBase 0.40 JSVM hooks (`pb_hooks`, CommonJS `require`), PB migrations, React 19 + Zustand client, Vitest, Node 20 import scripts (no new npm deps).

## Global Constraints

- Work on branch `dev` (repo rule; release = fast-forward to `main`).
- Gate before every commit: `pnpm lint && pnpm test && pnpm build` — all green.
- Conventional commits with scope, matching `git log` style: `feat(recipes): …`, `fix(pwa): …`.
- All files, comments, commits in English.
- House style: no schema libraries — manual field validation; anything malformed is dropped, never repaired. Every rendered dish must carry a real photo URL.
- No new npm dependencies anywhere (scripts use Node 20 built-ins).
- **FatSecret compliance (platform.fatsecret.com/terms + docs/guides/storable-data, checked 2026-08-29):** only IDs (`recipe_id`, `recipe_types`, …) are storable indefinitely; all other content must be removed or re-requested within 24h (`fetchedAt` + nightly job enforce this). No robots/spiders/systematic indexing — the API is called only to serve a real user request or to refresh rows such a request brought in. Attribution ("Powered by fatsecret") wherever their content displays, retained even if we stop using the API. Hard self-imposed budget: 4,500 calls/day (cap is 5,000).
- Recorded FatSecret responses live in `deploy/pocketbase/fixtures/` which is **gitignored** (committing content to a public repo would itself violate the 24h rule).
- PocketBase JSVM facts the hooks rely on: router handlers run in isolated VMs (nothing at file top level is visible inside them); share code via `require(`${__hooks}/utils/….js`)`; `$http.send` is synchronous; FatSecret returns numbers as JSON **strings** and collapses single-element arrays into objects.

---

## Phase A — FatSecret behind a local-first catalogue

### Task 0: FatSecret credentials and recorded fixtures (manual — Edd)

Claude must not create accounts; this task is yours. Everything later depends on it.

**Files:**
- Create: `deploy/pocketbase/fixtures/` (directory, gitignored in Task 1)

- [ ] **Step 1: Create the FatSecret app**

Sign up at <https://platform.fatsecret.com> (free **Basic** edition, self-signup). Create an application; note `Client ID` and `Client Secret`. In the platform console, whitelist the IPs that will request OAuth tokens: the Hetzner box's egress IP, and your dev machine's public IP if you want live top-ups in dev (up to 15 IPs allowed).

- [ ] **Step 2: Record the four fixtures**

```bash
cd /Users/edd/Projects/eddremonts86/actives/enForma && mkdir -p deploy/pocketbase/fixtures && \
FS_TOKEN=$(curl -s -X POST https://oauth.fatsecret.com/connect/token \
  -H "Authorization: Basic $(printf '%s' "$FATSECRET_CLIENT_ID:$FATSECRET_CLIENT_SECRET" | base64)" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&scope=basic' | tee deploy/pocketbase/fixtures/token.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))") && \
curl -s "https://platform.fatsecret.com/rest/recipe-types/v2?format=json" -H "Authorization: Bearer $FS_TOKEN" > deploy/pocketbase/fixtures/recipe-types.json && \
curl -s "https://platform.fatsecret.com/rest/recipes/search/v3?format=json&must_have_images=true&recipe_types=Main%20Dish&calories.to=700&max_results=5" -H "Authorization: Bearer $FS_TOKEN" > deploy/pocketbase/fixtures/search.json && \
RID=$(node -e "const j=require('./deploy/pocketbase/fixtures/search.json');const r=j.recipes.recipe;console.log((Array.isArray(r)?r[0]:r).recipe_id)") && \
curl -s "https://platform.fatsecret.com/rest/recipe/v2?format=json&recipe_id=$RID" -H "Authorization: Bearer $FS_TOKEN" > deploy/pocketbase/fixtures/recipe.json && \
ls -la deploy/pocketbase/fixtures/
```

Expected: four JSON files. `token.json` has `access_token` and `expires_in: 86400`. `search.json` has `recipes.recipe[]` entries with `recipe_id`, `recipe_name`, `recipe_image`, `recipe_nutrition.{calories,protein,carbohydrate,fat}`. `recipe.json` has `recipe.directions.direction[]`, `recipe.serving_sizes.serving.{calories,protein}`, `recipe.recipe_images`, `recipe.number_of_servings`.

- [ ] **Step 3: Confirm three things and write them down in the fixtures dir**

Create `deploy/pocketbase/fixtures/NOTES.md` recording: (1) Basic tier does return recipes (if `search.json` came back 403/402, stop — the whole plan pivots to the Phase B catalogue only); (2) the **exact** `recipe_type` strings from `recipe-types.json` (Task 2 hardcodes `'Main Dish'`, plus the breakfast/salad/soup/side names for Task 5 — adjust those constants if the fixture spells them differently, e.g. `"Main Dishes"`); (3) if the path-style URLs 404, the legacy equivalents work and Task 2's constants must switch to them: `https://platform.fatsecret.com/rest/server.api?method=recipes.search.v3&…` / `…?method=recipe.get.v2&recipe_id=…`.

- [ ] **Step 4: Set the env vars**

Add to `.env.local` (gitignored) at the repo root, and later to Coolify (Task 9):

```bash
grep -q FATSECRET .env.local || printf 'FATSECRET_CLIENT_ID=…\nFATSECRET_CLIENT_SECRET=…\n' >> .env.local
```

---

### Task 1: `recipes` collection migration

**Files:**
- Create: `deploy/pocketbase/pb_migrations/1756900000_recipes_catalogue.js`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Produces: collection `recipes` with fields `provider` (`'pd' | 'fatsecret'`), `providerId`, `title`, `image` (file), `imageUrl`, `kcal`, `proteinG`, `carbsG`, `fatG`, `servings`, `readyInMinutes`, `category`, `sourceCategory`, `directions` (json string[]), `ingredients` (json string[]), `sourceUrl`, `fetchedAt`, `usedAt`. Unique index on (`provider`,`providerId`). All API rules `null` (hooks-only).

- [ ] **Step 1: Write the migration**

```js
/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 8 storage: the app's own recipe catalogue. `pd` rows are public
 * domain content we keep forever (USDA MyPlate import); `fatsecret` rows are
 * a rolling cache — their terms make only IDs storable indefinitely, so
 * `fetchedAt` plus the nightly job in recipes.pb.js refresh or delete
 * anything older than 24h. Hooks read and write privileged; clients never
 * touch the collection directly.
 */
migrate(
  (app) => {
    const recipes = new Collection({
      type: 'base',
      name: 'recipes',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'provider', type: 'select', required: true, maxSelect: 1, values: ['pd', 'fatsecret'] },
        { name: 'providerId', type: 'text', required: true, max: 200 },
        { name: 'title', type: 'text', required: true, max: 300 },
        {
          name: 'image',
          type: 'file',
          maxSelect: 1,
          maxSize: 3000000,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        { name: 'imageUrl', type: 'text', max: 1000 },
        { name: 'kcal', type: 'number' },
        { name: 'proteinG', type: 'number' },
        { name: 'carbsG', type: 'number' },
        { name: 'fatG', type: 'number' },
        { name: 'servings', type: 'number' },
        { name: 'readyInMinutes', type: 'number' },
        { name: 'category', type: 'text', max: 40 },
        { name: 'sourceCategory', type: 'text', max: 200 },
        { name: 'directions', type: 'json', maxSize: 100000 },
        { name: 'ingredients', type: 'json', maxSize: 100000 },
        { name: 'sourceUrl', type: 'text', max: 1000 },
        { name: 'fetchedAt', type: 'date' },
        { name: 'usedAt', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_recipes_provider_pid` ON `recipes` (`provider`, `providerId`)',
        'CREATE INDEX `idx_recipes_kcal` ON `recipes` (`kcal`)',
        'CREATE INDEX `idx_recipes_protein` ON `recipes` (`proteinG`)',
        'CREATE INDEX `idx_recipes_category` ON `recipes` (`category`)',
      ],
    })
    app.save(recipes)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('recipes'))
  },
)
```

- [ ] **Step 2: Gitignore the fixtures**

Append to `.gitignore`:

```
deploy/pocketbase/fixtures/
```

- [ ] **Step 3: Apply and verify**

```bash
cd deploy/pocketbase && docker compose up -d --build pocketbase && sleep 3 && docker compose logs pocketbase | tail -5
```

Expected: startup log shows the migration applied, no errors. Then confirm the collection exists:

```bash
curl -s http://127.0.0.1:8090/api/health
```

Expected: `{"code":200,…}` (the collection check happens implicitly — a bad migration crashes boot).

- [ ] **Step 4: Commit**

```bash
git add deploy/pocketbase/pb_migrations/1756900000_recipes_catalogue.js .gitignore
git commit -m "feat(recipes): recipes catalogue collection for local-first food data"
```

---

### Task 2: FatSecret client module for hooks

**Files:**
- Create: `deploy/pocketbase/pb_hooks/utils/fatsecret.js`

**Interfaces:**
- Consumes: collection `shared_cache` (existing, key/value json) for the OAuth token and the daily quota counter; collection `recipes` (Task 1).
- Produces (CommonJS exports, all synchronous): `enabled(): boolean`, `searchIds(app, {maxKcal, minKcal, minProteinG, page, types}): string[]`, `fetchAndStore(app, recipeId): Record|null`, `normalizeDetail(raw): object|null`, `toArray(v): any[]`, `num(v): number|undefined`, `MAIN_TYPES`, `DAY_BUDGET`.

Files under `pb_hooks/utils/` do not end in `.pb.js`, so PocketBase does not auto-execute them; handlers load them fresh with `require`.

- [ ] **Step 1: Write the module**

```js
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
    const id = text(r && r.recipe_id) || (typeof (r && r.recipe_id) === 'number' ? String(r.recipe_id) : undefined)
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
  const images = toArray(r.recipe_images && r.recipe_images.recipe_image).map((i) => text(i)).filter(Boolean)
  const imageUrl = images[0]
  const serving = toArray(r.serving_sizes && r.serving_sizes.serving)[0]
  const directions = toArray(r.directions && r.directions.direction)
    .map((d) => text(d && d.direction_description))
    .filter(Boolean)
  const ingredients = toArray(r.ingredients && r.ingredients.ingredient)
    .map((i) => text(i && i.ingredient_description))
    .filter(Boolean)
  const types = toArray(r.recipe_types && r.recipe_types.recipe_type).map((t) => text(t)).filter(Boolean)
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
```

- [ ] **Step 2: Cross-check `normalizeDetail` against `fixtures/recipe.json`**

```bash
node -e "
const fx = require('./deploy/pocketbase/fixtures/recipe.json');
const r = fx.recipe;
console.log('id', r.recipe_id, '| name', r.recipe_name);
console.log('serving keys', Object.keys((Array.isArray(r.serving_sizes.serving)?r.serving_sizes.serving[0]:r.serving_sizes.serving)));
console.log('directions', (Array.isArray(r.directions.direction)?r.directions.direction:[r.directions.direction]).length);
console.log('images', JSON.stringify(r.recipe_images).slice(0,120));
"
```

Expected: the field spellings match what `normalizeDetail` reads (`serving_sizes.serving.calories/protein`, `directions.direction[].direction_description`, `recipe_images.recipe_image`). If any differ, fix the module now, not later.

- [ ] **Step 3: Commit**

```bash
git add deploy/pocketbase/pb_hooks/utils/fatsecret.js
git commit -m "feat(recipes): fatsecret client module for pocketbase hooks"
```

---

### Task 3: Catalogue helpers module

**Files:**
- Create: `deploy/pocketbase/pb_hooks/utils/recipes_lib.js`

**Interfaces:**
- Consumes: collections `recipes`, `shared_cache`; `fatsecret.js` (only inside `maintain`).
- Produces: `seedFrom(text): number` (bit-identical to `src/lib/seed.ts`), `DAILY_CATEGORIES: string[]`, `freshCutoff(): string`, `dishFromRecord(record): object`, `touchUsed(app, records): void`, `cacheGet(app, key)`, `cacheUpsert(app, key, value)`, `maintain(app): {stale, refreshed, deleted, purgedCache}`.

- [ ] **Step 1: Write the module**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add deploy/pocketbase/pb_hooks/utils/recipes_lib.js
git commit -m "feat(recipes): catalogue helpers and 24h maintenance for hooks"
```

---

### Task 4: Suggestions endpoint (local-first, live top-up)

**Files:**
- Create: `deploy/pocketbase/pb_hooks/recipes.pb.js`

**Interfaces:**
- Consumes: `utils/fatsecret.js`, `utils/recipes_lib.js`, collection `recipes`.
- Produces: `GET /api/enforma/recipes/suggestions?date=YYYY-MM-DD&maxKcal=N&minProtein=N[&minKcal=N]` (auth required) → `200 {"items":[Dish]}` where `Dish = {id, provider, title, imageUrl, kcal?, proteinG?, readyInMinutes?, category?, directions[], ingredients[], sourceUrl?}`. The client (Task 7) parses exactly this.

- [ ] **Step 1: Write the endpoint**

```js
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

  const localQuery = () => {
    let filter =
      "category = 'main' && proteinG >= {:prot} && kcal > 0 && kcal <= {:max}" +
      " && (provider = 'pd' || fetchedAt >= {:cutoff})"
    const params = { prot: minProtein, max: maxKcal, cutoff: lib.freshCutoff() }
    if (Number.isFinite(minKcal) && minKcal > 0) {
      filter += ' && kcal >= {:min}'
      params.min = minKcal
    }
    return $app.findRecordsByFilter('recipes', filter, '-proteinG,providerId', 40, 0, params)
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
        fresh = existing.getString('fetchedAt').replace(' ', 'T') >= lib.freshCutoff().replace(' ', 'T')
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
  lib.touchUsed($app, picked)
  return e.json(200, { items: picked.map(lib.dishFromRecord) })
})
```

- [ ] **Step 2: Restart PB and verify with curls**

```bash
cd deploy/pocketbase && docker compose restart pocketbase && sleep 2 && \
SU_TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/_superusers/auth-with-password -H 'Content-Type: application/json' -d "{\"identity\":\"$PB_SUPERUSER_EMAIL\",\"password\":\"$PB_SUPERUSER_PASSWORD\"}" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))") && \
curl -s -X POST http://127.0.0.1:8090/api/collections/users/records -H "Authorization: $SU_TOKEN" -H 'Content-Type: application/json' -d '{"email":"reciper@test.local","password":"testtest123","passwordConfirm":"testtest123"}' >/dev/null; \
U_TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password -H 'Content-Type: application/json' -d '{"identity":"reciper@test.local","password":"testtest123"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))") && \
curl -s "http://127.0.0.1:8090/api/enforma/recipes/suggestions?date=2026-08-30&maxKcal=700&minProtein=35" -H "Authorization: $U_TOKEN"
```

Expected (with FatSecret env set in `docker-compose` override or `.env` used by compose, and the machine's IP whitelisted): `{"items":[…]}` with up to 3 dishes, each with `provider:"fatsecret"`, a `m.ftscrt.com` image URL, `kcal`, `proteinG`, non-empty `directions`. Without keys: `{"items":[]}`. Unauthenticated: `401`. (If the `users` create call 400s because the sync collection requires extra fields, authenticate with any existing local dev member instead — only the `U_TOKEN` matters.) Repeat the same curl — the second run must be answered locally (check `docker compose logs` shows no new outbound call; or verify `shared_cache` row `fs-quota-…` did not increase):

```bash
curl -s "http://127.0.0.1:8090/api/collections/shared_cache/records?filter=(key~'fs-quota-')" -H "Authorization: $SU_TOKEN"
```

- [ ] **Step 3: Commit**

```bash
git add deploy/pocketbase/pb_hooks/recipes.pb.js
git commit -m "feat(recipes): local-first suggestions endpoint with fatsecret top-up"
```

---

### Task 5: Daily dish from the catalogue + capabilities + retire Spoonacular route

**Files:**
- Modify: `deploy/pocketbase/pb_hooks/recipes.pb.js` (append handler)
- Modify: `deploy/pocketbase/pb_hooks/shared_fetches.pb.js` (capabilities line; delete the old `/api/enforma/daily-dish` and `/api/recipes/spoonacular/recipes/complexSearch` handlers)

**Interfaces:**
- Produces: `GET /api/enforma/daily-dish?date=YYYY-MM-DD` (public) → `200 Dish` (same shape as Task 4; old clients that expect `id/title/imageUrl/category/sourceUrl` keep working — `source` is gone but they overwrite it locally). Capabilities `recipes` flag now means "catalogue or FatSecret available".

- [ ] **Step 1: Append the daily-dish handler to `recipes.pb.js`**

```js
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
```

- [ ] **Step 2: Edit `shared_fetches.pb.js`**

Delete the whole `routerAdd('GET', '/api/enforma/daily-dish', …)` block (lines 24–95) and the whole `routerAdd('GET', '/api/recipes/spoonacular/recipes/complexSearch', …)` block (lines 112–149). Update the file docstring's mention of Spoonacular to "recipes served by recipes.pb.js". Change the capabilities line:

```js
routerAdd('GET', '/api/enforma/capabilities', (e) => {
  let hasCatalogue = false
  try {
    hasCatalogue =
      $app.findRecordsByFilter('recipes', "provider = 'pd'", '', 1, 0).length > 0
  } catch {
    /* Collection missing on a pre-migration boot: capability stays false. */
  }
  return e.json(200, {
    coach: !!$os.getenv('MINIMAX_API_KEY'),
    recipes:
      hasCatalogue ||
      !!($os.getenv('FATSECRET_CLIENT_ID') && $os.getenv('FATSECRET_CLIENT_SECRET')),
    push: $os.getenv('VAPID_PUBLIC_KEY') || null,
  })
})
```

- [ ] **Step 3: Restart and verify**

```bash
cd deploy/pocketbase && docker compose restart pocketbase && sleep 2 && \
curl -s "http://127.0.0.1:8090/api/enforma/daily-dish?date=2026-08-30" && echo && \
curl -s "http://127.0.0.1:8090/api/enforma/daily-dish?date=2026-08-30" && echo && \
curl -s "http://127.0.0.1:8090/api/enforma/capabilities"
```

Expected: first call returns a dish with `directions` (from the catalogue rows Task 4's verification stored, or a fresh seed); the second returns the identical JSON (cache hit). Capabilities shows `"recipes":true` when keys are set. With no keys and an empty catalogue: `503` from daily-dish and `"recipes":false`.

- [ ] **Step 4: Commit**

```bash
git add deploy/pocketbase/pb_hooks/recipes.pb.js deploy/pocketbase/pb_hooks/shared_fetches.pb.js
git commit -m "feat(recipes): daily dish served from the catalogue; retire spoonacular route"
```

---

### Task 6: Nightly maintenance cron + manual trigger

**Files:**
- Modify: `deploy/pocketbase/pb_hooks/recipes.pb.js` (append)

**Interfaces:**
- Produces: cron `recipesRefresh` (04:00 UTC daily) running `recipes_lib.maintain`; `POST /api/enforma/recipes/maintenance` (superuser only) running the same body and returning its counters — the operational lever and the test seam.

- [ ] **Step 1: Append to `recipes.pb.js`**

```js
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
```

- [ ] **Step 2: Verify the stale path end to end**

Backdate one fatsecret row, run maintenance, confirm it was refreshed or deleted:

```bash
cd deploy/pocketbase && docker compose restart pocketbase && sleep 2 && \
REC=$(curl -s "http://127.0.0.1:8090/api/collections/recipes/records?filter=(provider='fatsecret')&perPage=1" -H "Authorization: $SU_TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.items[0]?j.items[0].id:'')})") && \
curl -s -X PATCH "http://127.0.0.1:8090/api/collections/recipes/records/$REC" -H "Authorization: $SU_TOKEN" -H 'Content-Type: application/json' -d '{"fetchedAt":"2026-08-20 00:00:00.000Z","usedAt":""}' >/dev/null && \
curl -s -X POST "http://127.0.0.1:8090/api/enforma/recipes/maintenance" -H "Authorization: $SU_TOKEN"
```

Expected: `{"stale":1,"refreshed":0,"deleted":1,…}` (unused stale row deleted). Re-run Task 4's suggestions curl afterwards to confirm the pool refills.

- [ ] **Step 3: Commit**

```bash
git add deploy/pocketbase/pb_hooks/recipes.pb.js
git commit -m "feat(recipes): nightly 24h refresh/purge job with manual trigger"
```

---

### Task 7: Client rewrite — `recipes.ts` and its spec (TDD)

**Files:**
- Modify: `src/lib/recipes.ts` (full rewrite below)
- Modify: `src/lib/recipes.spec.ts` (full rewrite below)

**Interfaces:**
- Consumes: `GET /pb/api/enforma/recipes/suggestions` and `GET /pb/api/enforma/daily-dish` (Tasks 4–5); `mealTargets`, `serverCapabilities`, `activeAuthHeader` (existing).
- Produces: `RecipeProvider = 'pd' | 'fatsecret' | 'sample'`; `RecipeSuggestion` gains `provider` (replacing `source`), `directions?: string[]`, `ingredients?: string[]`, keeps `id/title/imageUrl/kcal/proteinG/readyInMinutes/category/area/sourceUrl/coachNote`; `parseDish`, `parseDishList`, `suggestionsQuery`, `fetchDailyDish`, `fetchSuggestions`, `rankSuggestions`, `recipeSearchEnabled`. Tasks 8–9 depend on exactly these names.

- [ ] **Step 1: Rewrite the spec first (it must fail against the old module)**

Replace `src/lib/recipes.spec.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { nutritionTargetFor } from './nutrition-target'
import {
  parseDish,
  parseDishList,
  rankSuggestions,
  suggestionsQuery,
  type RecipeSuggestion,
} from './recipes'
import { seedFrom } from './seed'
import type { OnboardingInput } from './types'

const input: OnboardingInput = {
  age: 30,
  sex: 'hombre',
  weightKg: 90,
  targetWeightKg: 80,
  heightCm: 180,
  goal: 'adelgazar',
  level: 'intermedio',
  daysPerWeek: 4,
  minsPerSession: 60,
  equipment: 'hibrido',
  effort: 3,
}

const dish = {
  id: 'abc123',
  provider: 'fatsecret',
  title: 'Grilled Chicken Bowl',
  imageUrl: 'https://m.ftscrt.com/static/recipe/x.jpg',
  kcal: 520,
  proteinG: 42,
  readyInMinutes: 25,
  category: 'Main Dish',
  directions: ['Season the chicken.', 'Grill 6 minutes per side.'],
  ingredients: ['2 chicken breasts', '1 cup rice'],
  sourceUrl: 'https://www.fatsecret.com/recipes/x',
}

describe('seedFrom', () => {
  it('is deterministic', () => {
    expect(seedFrom('2026-08-30')).toBe(seedFrom('2026-08-30'))
    expect(seedFrom('2026-08-30')).not.toBe(seedFrom('2026-08-31'))
  })
})

describe('parseDish', () => {
  it('accepts a full server dish', () => {
    const parsed = parseDish(dish)
    expect(parsed).not.toBeNull()
    expect(parsed!.provider).toBe('fatsecret')
    expect(parsed!.kcal).toBe(520)
    expect(parsed!.directions).toEqual(dish.directions)
  })

  it('drops dishes missing id, title, image or a known provider', () => {
    expect(parseDish({ ...dish, imageUrl: '' })).toBeNull()
    expect(parseDish({ ...dish, title: '  ' })).toBeNull()
    expect(parseDish({ ...dish, provider: 'spoonacular' })).toBeNull()
    expect(parseDish(null)).toBeNull()
  })

  it('drops malformed optionals instead of repairing them', () => {
    const parsed = parseDish({ ...dish, kcal: 'lots', directions: ['ok', 42, ''] })
    expect(parsed!.kcal).toBeUndefined()
    expect(parsed!.directions).toEqual(['ok'])
  })
})

describe('parseDishList', () => {
  it('keeps only valid items', () => {
    const raw = { items: [dish, { ...dish, id: '' }, 'junk'] }
    expect(parseDishList(raw)).toHaveLength(1)
    expect(parseDishList({})).toEqual([])
    expect(parseDishList(undefined)).toEqual([])
  })
})

describe('suggestionsQuery', () => {
  it('sends only a calorie ceiling in a deficit', () => {
    const target = nutritionTargetFor(input) // adelgazar => deficit
    const params = new URLSearchParams(suggestionsQuery(target, '2026-08-30'))
    expect(params.get('date')).toBe('2026-08-30')
    expect(params.get('maxKcal')).toBeTruthy()
    expect(params.get('minKcal')).toBeNull()
    expect(Number(params.get('minProtein'))).toBeGreaterThan(0)
  })

  it('sends a calorie band in a surplus', () => {
    const target = nutritionTargetFor({ ...input, goal: 'musculo', targetWeightKg: 100 })
    const params = new URLSearchParams(suggestionsQuery(target, '2026-08-30'))
    expect(Number(params.get('minKcal'))).toBeGreaterThan(0)
    expect(Number(params.get('maxKcal'))).toBeGreaterThan(Number(params.get('minKcal')))
  })
})

describe('rankSuggestions', () => {
  const mk = (id: string, kcal: number, proteinG: number): RecipeSuggestion => ({
    id,
    provider: 'sample',
    title: id,
    imageUrl: 'x.jpg',
    kcal,
    proteinG,
  })

  it('prefers protein density in a deficit', () => {
    const target = nutritionTargetFor(input)
    const ranked = rankSuggestions([mk('a', 700, 30), mk('b', 400, 38)], target)
    expect(ranked[0].id).toBe('b')
  })

  it('sends missing-macro dishes to the back', () => {
    const target = nutritionTargetFor(input)
    const noMacros: RecipeSuggestion = {
      id: 'c',
      provider: 'sample',
      title: 'c',
      imageUrl: 'x.jpg',
    }
    const ranked = rankSuggestions([noMacros, mk('b', 400, 38)], target)
    expect(ranked[ranked.length - 1].id).toBe('c')
  })
})
```

- [ ] **Step 2: Run it — it must fail**

```bash
pnpm test src/lib/recipes.spec.ts
```

Expected: FAIL — `parseDish`, `parseDishList`, `suggestionsQuery` are not exported yet.

- [ ] **Step 3: Rewrite `src/lib/recipes.ts`**

```ts
import { mealTargets, type NutritionTarget } from './nutrition-target'
import { serverCapabilities } from './capabilities'
import { activeAuthHeader } from './sync'

/**
 * Food recommendations come from the app's own sync server (phase 8): a
 * local-first catalogue in PocketBase where public-domain rows (USDA MyPlate)
 * live forever and FatSecret rows are a 24-hour rolling cache the server
 * tops up on demand. The browser never talks to a recipe vendor directly.
 * Every dish carries a real photo; anything malformed is dropped, never
 * repaired. `parseDish` mirrors dishFromRecord in pb_hooks/utils/recipes_lib.
 */

export type RecipeProvider = 'pd' | 'fatsecret' | 'sample'

export interface RecipeSuggestion {
  id: string
  provider: RecipeProvider
  title: string
  imageUrl: string
  sourceUrl?: string
  kcal?: number
  proteinG?: number
  readyInMinutes?: number
  category?: string
  area?: string
  directions?: string[]
  ingredients?: string[]
  /** One sentence from the AI coach on why this dish fits. Optional. */
  coachNote?: string
}

/** Suggestions need a signed-in member; the server owns every vendor key. */
export function recipeSearchEnabled(): boolean {
  return serverCapabilities().recipes && activeAuthHeader() !== null
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : undefined
}

function asSteps(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const steps = value.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  return steps.length > 0 ? steps : undefined
}

export function parseDish(raw: unknown): RecipeSuggestion | null {
  const r = raw as Record<string, unknown> | null | undefined
  const id = asText(r?.id)
  const title = asText(r?.title)
  const imageUrl = asText(r?.imageUrl)
  const provider = r?.provider === 'pd' || r?.provider === 'fatsecret' ? r.provider : undefined
  if (!id || !title || !imageUrl || !provider) return null
  return {
    id,
    provider,
    title,
    imageUrl,
    kcal: asNumber(r?.kcal),
    proteinG: asNumber(r?.proteinG),
    readyInMinutes: asNumber(r?.readyInMinutes),
    category: asText(r?.category),
    sourceUrl: asText(r?.sourceUrl),
    directions: asSteps(r?.directions),
    ingredients: asSteps(r?.ingredients),
  }
}

export function parseDishList(raw: unknown): RecipeSuggestion[] {
  const items = (raw as { items?: unknown })?.items
  if (!Array.isArray(items)) return []
  const dishes: RecipeSuggestion[] = []
  for (const item of items) {
    const dish = parseDish(item)
    if (dish) dishes.push(dish)
  }
  return dishes
}

/**
 * The daily suggestion query. Deterministic for a given date and target so
 * the server cache is coherent and vendor calls happen once, not per visit.
 * Direction decides which side of the calorie band is enforced.
 */
export function suggestionsQuery(target: NutritionTarget, dateIso: string): string {
  const meal = mealTargets(target)
  const params = new URLSearchParams()
  params.set('date', dateIso)
  params.set('minProtein', String(meal.proteinMinG))
  if (target.direction === 'surplus') {
    params.set('minKcal', String(meal.kcalMin))
    params.set('maxKcal', String(Math.round(meal.kcalMax * 1.25)))
  } else {
    params.set('maxKcal', String(meal.kcalMax))
  }
  return params.toString()
}

/** The server computes and caches the same daily pick once for everyone. */
export async function fetchDailyDish(dateIso: string): Promise<RecipeSuggestion | null> {
  try {
    const res = await fetch(`/pb/api/enforma/daily-dish?date=${encodeURIComponent(dateIso)}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return parseDish(await res.json())
  } catch {
    return null
  }
}

export async function fetchSuggestions(
  target: NutritionTarget,
  dateIso: string,
): Promise<RecipeSuggestion[]> {
  try {
    const res = await fetch(
      `/pb/api/enforma/recipes/suggestions?${suggestionsQuery(target, dateIso)}`,
      { headers: activeAuthHeader() ?? {}, signal: AbortSignal.timeout(20000) },
    )
    if (!res.ok) return []
    return parseDishList(await res.json())
  } catch {
    return []
  }
}

/**
 * Deterministic ordering when the AI coach is off or fails. In a deficit the
 * most protein per calorie wins; in a surplus the fullest plate that still
 * meets the protein floor; maintenance prefers the middle of the meal band.
 */
export function rankSuggestions(
  items: RecipeSuggestion[],
  target: NutritionTarget,
): RecipeSuggestion[] {
  const meal = mealTargets(target)
  const mid = (meal.kcalMin + meal.kcalMax) / 2
  const score = (r: RecipeSuggestion): number => {
    if (r.kcal === undefined || r.proteinG === undefined) return -1
    if (target.direction === 'deficit') return r.proteinG / Math.max(r.kcal, 1)
    if (target.direction === 'surplus') return r.kcal + r.proteinG
    return -Math.abs(r.kcal - mid)
  }
  return [...items].sort((a, b) => score(b) - score(a))
}
```

Note what is gone: `RecipeSource`, `MEALDB_BASE`, `DAILY_CATEGORIES`, `dailyCategoryFor`, `isPlate`, `parseMealDbList`, `parseMealDbDetail`, `spoonacularQuery`, `parseSpoonacularResults`, and the browser-side TheMealDB fallback in `fetchDailyDish` (offline now falls back to the bundled samples via `useRecipes`, which already handles it).

- [ ] **Step 4: Run the spec — it must pass; then find every broken caller**

```bash
pnpm test src/lib/recipes.spec.ts && pnpm build
```

Expected: spec PASSES; `tsc -b` FAILS in `useRecipes.ts`, `meal-suggestions.tsx`, `sample-recipes.ts`, `recipe-coach.spec.ts` (they still say `source`). That is Task 8's worklist — do not fix here beyond confirming the list matches.

- [ ] **Step 5: Commit (lib + spec only; the build gate completes in Task 8)**

```bash
git add src/lib/recipes.ts src/lib/recipes.spec.ts
git commit -m "feat(recipes): client consumes the server catalogue shape"
```

---

### Task 8: Store, samples, coach spec, and components

**Files:**
- Modify: `src/data/sample-recipes.ts` (`source:` → `provider: 'sample'` on the three entries; keep everything else)
- Modify: `src/store/useRecipes.ts:115` (call signature unchanged; nothing else to touch — verify only)
- Modify: `src/lib/recipe-coach.spec.ts` (replace `source:` with `provider: 'sample'` in its fixtures)
- Create: `src/components/recipe-preparation.tsx`
- Create: `src/components/recipe-attribution.tsx`
- Modify: `src/components/recipe-card.tsx`
- Modify: `src/components/dish-of-the-day.tsx`
- Modify: `src/components/meal-suggestions.tsx`
- Modify: `src/routes/Settings.tsx:315-340` (About attribution block)

**Interfaces:**
- Consumes: `RecipeSuggestion` with `provider`, `directions`, `ingredients` (Task 7).
- Produces: `<RecipePreparation dish={RecipeSuggestion} />` (collapsible ingredients + numbered steps; renders nothing without directions) and `<RecipeAttribution items={RecipeSuggestion[]} />` (the legally-required source line).

- [ ] **Step 1: Mechanical renames**

In `src/data/sample-recipes.ts` replace each `source: 'sample',` with `provider: 'sample',` (3 occurrences) and update the doc comment's "Live suggestions always carry their provider's numbers." (already true). In `src/lib/recipe-coach.spec.ts` replace every `source:` fixture field with `provider: 'sample'`.

- [ ] **Step 2: New presentational components**

`src/components/recipe-preparation.tsx`:

```tsx
import type { RecipeSuggestion } from '../lib/recipes'

/**
 * Ingredients and numbered steps, folded by default so the card stays a
 * card. Only rendered when the catalogue actually delivered directions —
 * sample dishes and legacy cached payloads simply do not show it.
 */
export function RecipePreparation({ dish }: { dish: RecipeSuggestion }) {
  if (!dish.directions || dish.directions.length === 0) return null
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-2xs font-medium text-brand">
        How to make it
      </summary>
      {dish.ingredients && dish.ingredients.length > 0 && (
        <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-2xs leading-relaxed text-ink-3">
          {dish.ingredients.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      <ol className="mt-1.5 flex list-decimal flex-col gap-1 pl-4 text-2xs leading-relaxed text-ink-3">
        {dish.directions.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  )
}
```

`src/components/recipe-attribution.tsx`:

```tsx
import type { RecipeSuggestion } from '../lib/recipes'

/**
 * The source line under recipe content. FatSecret's terms require visible
 * attribution wherever their content displays (and that the link outlives
 * our use of the API); public-domain rows get a courtesy credit; samples
 * keep crediting TheMealDB for the bundled photos.
 */
export function RecipeAttribution({ items }: { items: RecipeSuggestion[] }) {
  const providers = new Set(items.map((d) => d.provider))
  const parts: React.ReactNode[] = []
  if (providers.has('fatsecret')) {
    parts.push(
      <a
        key="fs"
        href="https://platform.fatsecret.com"
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2"
      >
        Powered by fatsecret
      </a>,
    )
  }
  if (providers.has('pd')) {
    parts.push(<span key="pd">Recipes and nutrition from USDA MyPlate (public domain)</span>)
  }
  if (providers.has('sample')) {
    parts.push(
      <span key="sample">
        Sample dishes with editorial estimates; photos from{' '}
        <a
          href="https://www.themealdb.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          TheMealDB
        </a>
      </span>,
    )
  }
  if (parts.length === 0) return null
  return (
    <p className="text-2xs text-ink-3">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {part}
        </span>
      ))}
      .
    </p>
  )
}
```

- [ ] **Step 3: Wire the components**

`src/components/recipe-card.tsx` — add the import and render `<RecipePreparation dish={dish} />` between the coach note and the source link:

```tsx
import { RecipePreparation } from './recipe-preparation'
```

```tsx
        {dish.coachNote && (
          <p className="text-2xs leading-relaxed text-ink-3">{dish.coachNote}</p>
        )}
        <RecipePreparation dish={dish} />
        {dish.sourceUrl && (
```

`src/components/dish-of-the-day.tsx` — add imports `RecipePreparation`, `RecipeAttribution`; render `<RecipePreparation dish={daily.dish} />` after the coach-note paragraph (inside the text column, before the source link); replace the whole trailing `<p className="text-2xs …">Recipe and photo from … TheMealDB …</p>` block with:

```tsx
      {daily && <RecipeAttribution items={[daily.dish]} />}
```

`src/components/meal-suggestions.tsx` — delete `const live = items.some((r) => r.source === 'spoonacular')` and the whole trailing attribution `{items.length > 0 && (<p …>…spoonacular…TheMealDB…</p>)}` block; replace with:

```tsx
      {items.length > 0 && <RecipeAttribution items={items} />}
```

and add the import.

- [ ] **Step 4: Settings → About attribution copy**

In `src/routes/Settings.tsx:316-336`, replace this paragraph:

```tsx
          <p className="max-w-[62ch] text-2xs">
            The dish of the day, with its photo, comes from{' '}
            <a
              href="https://www.themealdb.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              TheMealDB
            </a>
            . Meal suggestions, their nutrition numbers and photos come from the{' '}
            <a
              href="https://spoonacular.com/food-api"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              spoonacular API
            </a>
            .
          </p>
```

with:

```tsx
          <p className="max-w-[62ch] text-2xs">
            Recipes, their photos, preparation steps and nutrition numbers come
            from USDA MyPlate (public domain) and the{' '}
            <a
              href="https://platform.fatsecret.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              fatsecret Platform API
            </a>
            . Offline sample dish photos from{' '}
            <a
              href="https://www.themealdb.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              TheMealDB
            </a>
            .
          </p>
```

- [ ] **Step 5: Full gate**

```bash
pnpm lint && pnpm test && pnpm build
```

Expected: all green — the Task 7 `tsc` breakages are now resolved.

- [ ] **Step 6: Runtime smoke via dev server**

Run `pnpm dev` with the local PB container up; open the Menu page: dish of the day renders with a "How to make it" fold and the attribution line; Today page shows 3 suggestions with kcal/protein tags and the fatsecret line. Offline (stop the container): sample dish + sample suggestions render with the TheMealDB sample line.

- [ ] **Step 7: Commit**

```bash
git add src/data/sample-recipes.ts src/lib/recipe-coach.spec.ts src/components/recipe-preparation.tsx src/components/recipe-attribution.tsx src/components/recipe-card.tsx src/components/dish-of-the-day.tsx src/components/meal-suggestions.tsx src/routes/Settings.tsx
git commit -m "feat(recipes): in-app preparation steps and provider attribution"
```

---

### Task 9: Plumbing cleanup — vite, env, docs

**Files:**
- Modify: `vite.config.ts` (delete the `recipeProxy` block at lines 36–54, the `__RECIPE_SEARCH__` define at line 92, and the `...(env.SPOONACULAR_API_KEY ? {} : { '/api/recipes': … })` spread at lines 81–83; remove `recipeProxy` from the `apiProxy` merge)
- Modify: `src/vite-env.d.ts` (delete the `declare const __RECIPE_SEARCH__: boolean` line)
- Modify: `deploy/pocketbase/docker-compose.yml` (replace `SPOONACULAR_API_KEY: ${SPOONACULAR_API_KEY:-}` with `FATSECRET_CLIENT_ID: ${FATSECRET_CLIENT_ID:-}` and `FATSECRET_CLIENT_SECRET: ${FATSECRET_CLIENT_SECRET:-}`)
- Modify: `deploy/pocketbase/README.md` (env var table/text: same replacement; add one line: "FatSecret tokens are IP-whitelisted — add this host's egress IP in the FatSecret console.")
- Modify: `ATTRIBUTION.md`

**Interfaces:**
- Consumes: nothing new. Produces: a repo with zero Spoonacular references outside `docs/plans/` history.

- [ ] **Step 1: Apply the four mechanical edits above**

- [ ] **Step 2: ATTRIBUTION.md — replace the TheMealDB section's scope and add two sections**

```markdown
## fatsecret Platform API (free Basic tier, attribution required)

- **What**: live recipe search results (photos, directions, per-serving
  nutrition) served through the sync server and cached there for at most 24
  hours — FatSecret's terms make only IDs storable indefinitely, and the
  nightly job refreshes or removes everything else.
- **Source**: <https://platform.fatsecret.com>
- **License**: fatsecret Platform API Terms of Use. Attribution ("Powered by
  fatsecret", linked) is rendered wherever their content displays, and per
  their terms this credit is retained even if the app stops using the API.

## USDA MyPlate Kitchen recipes (public domain)

- **What**: the retired MyPlate Kitchen collection (recipes, photos,
  nutrition tables) imported into the sync server's catalogue.
- **Source**: myplate.gov via the Internet Archive (the site was retired
  2026-01-07); works of the US federal government, 17 USC §105.
- **License**: public domain. Credit is given in the app as a courtesy.
```

And in the existing TheMealDB section change the "What" line to: sample dish photos bundled in `src/data/sample-recipes.ts` only (the live daily dish no longer uses TheMealDB).

- [ ] **Step 3: Search for stragglers**

```bash
grep -rn "spoonacular\|SPOONACULAR" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.yml" --include="*.md" src deploy vite.config.ts ATTRIBUTION.md | grep -v docs/plans
```

Expected: no output. (TheMealDB references remain only in `sample-recipes.ts`, `recipe-attribution.tsx`, `Settings.tsx`, `ATTRIBUTION.md`.)

- [ ] **Step 4: Gate + commit**

```bash
pnpm lint && pnpm test && pnpm build
git add vite.config.ts src/vite-env.d.ts deploy/pocketbase/docker-compose.yml deploy/pocketbase/README.md ATTRIBUTION.md
git commit -m "chore(recipes): retire spoonacular plumbing; document fatsecret and MyPlate"
```

Deploy note (for the release that ships Phase A): set `FATSECRET_CLIENT_ID`/`FATSECRET_CLIENT_SECRET` in Coolify for the replica (dev branch) and production (main), remove `SPOONACULAR_API_KEY`, and confirm the Hetzner egress IP is whitelisted in the FatSecret console. The old `SPOONACULAR_API_KEY` pasted in chat on 2026-08-26 can now simply be revoked instead of rotated.

---

## Phase B — the permanent replica: USDA MyPlate import

Ships independently after Task 1. Until it lands, the catalogue is FatSecret-only and everything still works.

### Task 10: Wayback crawler

**Files:**
- Create: `scripts/import/myplate-crawl.mjs`
- Modify: `.gitignore` (append `scripts/import/out/`)

**Interfaces:**
- Produces: `scripts/import/out/myplate.json` — array of `{slug, title, courses: string[], directions: string[], ingredients: string[], kcal, proteinG, carbsG, fatG, servings, imageFile, sourceUrl}` — and `scripts/import/out/images/<slug>.jpg`. Task 11 consumes exactly this.

- [ ] **Step 1: Write the crawler**

```js
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
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
    (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
      .map((x) => (typeof x === 'string' ? x : x && typeof x.text === 'string' ? x.text : ''))
      .map((s) => decode(s))
      .filter(Boolean)

  let directions = ld ? listFrom(ld.recipeInstructions) : []
  let ingredients = ld ? listFrom(ld.recipeIngredient) : []
  if (directions.length === 0) {
    const block = (html.match(
      /field--name-field-instructions[\s\S]*?<ol[^>]*>([\s\S]*?)<\/ol>/,
    ) || [])[1]
    if (block) directions = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]))
  }
  if (ingredients.length === 0) {
    const block = (html.match(
      /field--name-field-ingredients[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/,
    ) || [])[1]
    if (block) ingredients = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => decode(m[1]))
  }
  if (directions.length === 0) return null

  const nutriNum = (label) => {
    const ldKey = { 'Total Calories': 'calories', Protein: 'proteinContent', Carbohydrates: 'carbohydrateContent', 'Total Fat': 'fatContent' }[label]
    const fromLd = ld && ld.nutrition && ld.nutrition[ldKey]
    const source = typeof fromLd === 'string' ? fromLd : (html.match(new RegExp(`>\\s*${label}\\s*<[\\s\\S]{0,200}?([\\d.]+)`)) || [])[1]
    const n = parseFloat(String(source))
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined
  }

  const servings = (() => {
    const fromLd = ld && (ld.recipeYield || ld.yield)
    const m = String(fromLd || (html.match(/>\s*(?:Makes|Serves|Servings?)[:\s<][\s\S]{0,80}?(\d+)/i) || [])[1] || '')
    const n = parseInt(m.match(/\d+/)?.[0] || '', 10)
    return Number.isFinite(n) && n > 0 ? n : undefined
  })()

  const courses = ld
    ? listFrom(ld.recipeCategory)
    : [...html.matchAll(/recipes\?f%5B\d%5D=course[^"]*"[^>]*>([^<]+)</g)].map((m) => decode(m[1]))

  const image =
    (ld && (typeof ld.image === 'string' ? ld.image : Array.isArray(ld.image) ? ld.image[0] : ld.image && ld.image.url)) ||
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
    const cdx = JSON.parse(await get(cdxUrl))
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
```

- [ ] **Step 2: Verify on three pages**

```bash
node scripts/import/myplate-crawl.mjs --limit 3 && node -e "
const r = require('./scripts/import/out/myplate.json');
console.log(r.length, 'recipes');
for (const x of r) console.log(x.slug, '| kcal', x.kcal, '| protein', x.proteinG, '| steps', x.directions.length, '| img', x.imageFile);
"
```

Expected: up to 3 entries, each with kcal, proteinG, ≥2 steps, an image file in `out/images/`. If all three are `parse-failed`, open one archived page in a browser, adjust `parsePage`'s selectors to the actual markup, and re-run (delete `out/state.json` first). This is the one deliberately iterative step of the plan — archived Drupal markup varies by snapshot year.

- [ ] **Step 3: Commit (code only; `out/` is gitignored)**

```bash
git add scripts/import/myplate-crawl.mjs .gitignore
git commit -m "feat(recipes): wayback crawler for the public-domain MyPlate collection"
```

### Task 11: Full crawl + seed script + local import

**Files:**
- Create: `scripts/import/myplate-seed.mjs`

**Interfaces:**
- Consumes: `out/myplate.json` + `out/images/` (Task 10); PocketBase superuser env (`PB_URL`, `PB_SUPERUSER_EMAIL`, `PB_SUPERUSER_PASSWORD`).
- Produces: `pd` rows in the `recipes` collection, images attached as PocketBase files.

- [ ] **Step 1: Run the full crawl (background, ~1–2h at the polite rate)**

```bash
node scripts/import/myplate-crawl.mjs 2>&1 | tee scripts/import/out/crawl.log
```

Expected: several hundred to ~1,000 `ok` lines (the archive holds ~1,072 recipes; some lack photos or parseable nutrition and are skipped honestly). Spot-check afterwards:

```bash
node -e "const r=require('./scripts/import/out/myplate.json');const withP=r.filter(x=>x.proteinG!==undefined).length;console.log('total',r.length,'| with protein',withP,'| sample:',r[0].title)"
```

- [ ] **Step 2: Write the seeder**

```js
#!/usr/bin/env node
/**
 * Seeds the `recipes` collection with the crawled public-domain MyPlate
 * rows. Idempotent: existing (pd, slug) rows are updated, not duplicated.
 * Usage: PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
 *          node scripts/import/myplate-seed.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const OUT = path.join(import.meta.dirname, 'out')
const PB = process.env.PB_URL || 'http://127.0.0.1:8090'

function normalizeCategory(courses) {
  const all = (courses || []).join(' ').toLowerCase()
  if (all.includes('breakfast')) return 'breakfast'
  if (all.includes('salad')) return 'salad'
  if (all.includes('soup') || all.includes('stew')) return 'soup'
  if (all.includes('side')) return 'side'
  if (all.includes('dessert')) return 'dessert'
  if (all.includes('snack')) return 'snack'
  if (all.includes('beverage') || all.includes('drink')) return 'drink'
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
  for (const r of recipes) {
    const existing = await fetch(
      `${PB}/api/collections/recipes/records?filter=${encodeURIComponent(`provider='pd' && providerId='${r.slug}'`)}&perPage=1`,
      { headers },
    ).then((x) => x.json())

    const form = new FormData()
    form.set('provider', 'pd')
    form.set('providerId', r.slug)
    form.set('title', r.title)
    form.set('category', normalizeCategory(r.courses))
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
      continue
    }
    hit ? updated++ : created++
  }
  console.log(`Seed done: ${created} created, ${updated} updated of ${recipes.length}.`)
}

await main()
```

- [ ] **Step 3: Seed the local instance and verify the endpoints prefer PD**

```bash
PB_URL=http://127.0.0.1:8090 PB_SUPERUSER_EMAIL=$PB_SUPERUSER_EMAIL PB_SUPERUSER_PASSWORD=$PB_SUPERUSER_PASSWORD node scripts/import/myplate-seed.mjs && \
curl -s "http://127.0.0.1:8090/api/enforma/daily-dish?date=2026-09-01" && echo && \
curl -s "http://127.0.0.1:8090/api/enforma/recipes/suggestions?date=2026-09-01&maxKcal=600&minProtein=20" -H "Authorization: $U_TOKEN"
```

Expected: seed reports created ≈ crawl count; the daily dish for a new date has `"provider":"pd"` and an `/pb/api/files/recipes/…` image URL; suggestions include pd rows without any FatSecret call (check the `fs-quota-` counter did not move). Open the image URL in a browser — it must render.

- [ ] **Step 4: Commit**

```bash
git add scripts/import/myplate-seed.mjs
git commit -m "feat(recipes): seed the catalogue with public-domain MyPlate recipes"
```

### Task 12: Production seed + closure

**Files:**
- Modify: `deploy/pocketbase/README.md` (append a "Seeding the catalogue" section: the two script commands with `PB_URL=https://<pb-host>` and the note that `out/` transfers ~1 GB of images, so run the seeder from the dev machine against the production URL)
- Modify: `docs/plans/2026-08-29-recipes-local-first-fatsecret.md` (status header)

- [ ] **Step 1: Deploy Phase A + B code** (dev branch → replica; fast-forward to main per repo rule when satisfied), set the FatSecret env vars in Coolify, confirm the Hetzner egress IP is whitelisted.

- [ ] **Step 2: Run the seeder against production PB** with the production superuser credentials. Verify `https://enforma.eduardoinerarte.dk` shows the PD daily dish with steps, and the suggestions carry attribution.

- [ ] **Step 3: Verify the cron ran** the next morning: `docker compose logs pocketbase | grep '\[recipes\] maintenance'` on the box shows the counters; the `fs-quota-` counter stays far below 4,500.

- [ ] **Step 4: Update this plan's header** to `Status: implemented YYYY-MM-DD` with a short implementation-notes blockquote (repo convention), commit:

```bash
git add docs/plans/2026-08-29-recipes-local-first-fatsecret.md deploy/pocketbase/README.md
git commit -m "docs(recipes): record local-first catalogue rollout"
```

---

## Risks / open questions

- **FatSecret Basic recipe scope**: docs strongly imply recipes are included (no "Premier Exclusive" badge on the recipe methods) but Task 0's smoke test is the gate. If it fails, Phase B alone still replaces Spoonacular (PD catalogue + no external API), and the FatSecret tasks are dropped.
- **Exact `recipe_types` strings and URL style**: pinned by Task 0's fixtures; two constants (`MAIN_TYPES`, endpoint URLs) absorb any difference.
- **Archived MyPlate markup variance**: Task 10 Step 2 is explicitly iterative; snapshots from different years may need a second selector. The crawler skips honestly rather than importing junk.
- **Old client caches**: localStorage payloads with `source` instead of `provider` render without attribution for at most one day (date-keyed cache rolls at midnight). Accepted.
- **Dev without a local PB container** no longer gets a live daily dish (the browser-direct TheMealDB path is gone); it falls back to sample dishes. Documented behaviour, matches production architecture.
- **FatSecret catalog is US/English** (~19k recipes) — same language as the rest of the app's content sources; the MiniMax coach note remains the localization hook.
