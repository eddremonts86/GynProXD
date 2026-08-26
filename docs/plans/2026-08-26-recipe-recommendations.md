# Recipe recommendations: daily dish + plan-aligned suggestions

Status: implemented 2026-08-26 (all phases, same day)
Date: 2026-08-26

> Implementation notes. The app's UI turned out to be English (the Spanish
> domain vocabulary is never rendered raw, see `src/lib/labels.ts`), so the
> planned translate-to-Spanish pass was dropped: recipe titles are shown as
> delivered and the coach writes its notes in English like the rest of the
> UI. TheMealDB's category lists mix plates with condiments and cake, so a
> deterministic `isPlate` title filter was added and the thin "Vegan"
> category was dropped from the daily rotation in favour of "Vegetarian".
> The web-only decision makes TheMealDB's app-store supporter clause moot.

## Goal

Give members food recommendations inside enForma:

1. A **dish of the day** — one good, photographed plate every day.
2. **Plan-aligned suggestions** — dishes that fit the member's declared goal
   and weight trajectory (e.g. `adelgazar` 90kg → 80kg needs a deficit with
   high protein; `musculo` 70kg → 100kg needs a surplus).
3. **LLM integration** — the app's MiniMax coach curates and explains the
   picks in Spanish. Every proposed dish must carry a real image.

## Research: free recipe APIs (verified 2026-08-26)

| API | Free tier | Images | Nutrition | Notes |
|---|---|---|---|---|
| **TheMealDB** | Test key `1`, no hard rate limit stated; "always free at point of access" | Yes — stable CDN URLs, `/preview` small/medium/large variants, plus ingredient PNGs | **No** (recipes only) | English content; single-ingredient/category/area filters free; multi-ingredient filter, latest, 10-random are premium (small PayPal support). Docs say become a supporter before an app-store release. |
| **Spoonacular** | **150 points/day** (points, not requests; nutrition-heavy calls cost more) | Yes — recipe images via CDN | **Yes** — calories/macros, `minProtein`, `maxCalories`, diet filters on `complexSearch` | English content. Attribution required. The point budget is the real constraint; fine for one shared daily fetch, not for per-user live search. |
| **Edamam Recipe Search** | "Minimum service" free plan, very limited | Yes, but **signed URLs that expire** | Yes (macros) | ToS only allows caching 4 macro datapoints + title/URI/image, per end-user behind a password — hostile to enForma's local-first, device-level storage. Rejected. |
| **API Ninjas Recipe** | Free tier exists | **No images** | Partial | Free tier forbids commercial use. Rejected (images are a hard requirement). |
| **Tasty (RapidAPI)** | Public API retired | — | — | Rejected. |

Sources: themealdb.com/api.php, spoonacular.com/food-api/pricing,
developer.edamam.com (recipe API + FAQ), api-ninjas.com/api/recipe,
calorieapi.com/blog/spoonacular-api-pricing.

### Decision

**Hybrid: TheMealDB as the base catalogue (free, images, unlimited-ish) +
Spoonacular free tier for nutrition-filtered search (150 pts/day, cached
aggressively).** Neither source is Spanish, so the MiniMax pass translates
titles/descriptions and writes the coach note — content curation is exactly
requirement 3.

Nutrition strategy per source:

- Spoonacular results arrive with calories/protein — trust them.
- TheMealDB results have no nutrition — the LLM may *tag* a dish
  (alto en proteína / ligero / contundente) but never invents numbers.
  Following the existing validation boundary (see `src/lib/ai-plan.ts`):
  arithmetic stays local, the model never negotiates it.

## Architecture

Mirrors the MiniMax pattern already in the repo: keys live server-side behind
a dev/preview proxy, responses are hard-validated, and everything falls back
to deterministic local data.

```
Vite proxy                     lib                        store/UI
/api/recipes/mealdb/*   →  recipes.ts (adapters,     →  useRecipes.ts (localStorage,
/api/recipes/spoon/*        validation, types)           date-keyed cache)
/api/minimax (existing) →  recipe-coach.ts (curation)→  Menu.tsx / Today.tsx cards
                           nutrition-target.ts (local math)
```

- **Proxy**: extend `vite.config.ts` with `/api/recipes/spoon` (injects
  `SPOONACULAR_KEY` from env) and `/api/recipes/mealdb` (plain pass-through;
  key is part of the path). Same shape as the `/api/minimax` block.
- **`src/lib/recipes.ts`**: `RecipeSuggestion` type (id, source, title,
  titleEs, imageUrl, kcal?, proteinG?, tags, sourceUrl), one adapter per
  provider, manual field validation in the house style (no schema lib),
  anything malformed is dropped.
- **`src/lib/nutrition-target.ts`**: pure functions, unit-tested.
  Mifflin-St Jeor BMR from `OnboardingInput` (sex, weightKg, heightCm, age)
  × activity → TDEE; direction and size of the calorie delta from
  `goal` + `weightKg` → `targetWeightKg` at the safe rates the plan
  generator already enforces; protein target g/kg by goal. Output:
  `{ kcalTarget, proteinMinG, direction: 'deficit' | 'surplus' | 'maintain' }`.
- **`src/lib/recipe-coach.ts`**: MiniMax Text-01 receives the *already
  fetched* candidate list (ids + titles + nutrition) plus the local targets,
  and returns `{ picks: [{ id, note }] }`. Validation identical in spirit to
  `validateBlocks`: every id must exist in the candidate list, notes are
  `cleanText`-ed, anything else falls back to a deterministic ranking
  (closest kcal fit, protein floor met). The model can only reorder and
  explain — never invent a dish, so every pick has a real image by
  construction.
- **`src/store/useRecipes.ts`**: clone of `useMenus` mechanics. Cache keyed
  by ISO date (+ profile goal hash for the aligned list). One fetch per day
  per device; `storage` event rehydrate; stale cache served on network
  failure.
- **`src/data/sample-recipes.ts`**: a handful of bundled suggestions (like
  `sample-menu.ts`) so the feature composes a real empty/offline state.

### Budget math (why this fits the free tiers)

Dish of the day: 1 TheMealDB lookup/day/device, deterministic pick
(seeded by date over a curated category list) so every device converges on
the same dish without a backend. Plan-aligned list: 1 Spoonacular
`complexSearch` + nutrition per day per goal-profile (~10–30 pts), cached
all day → single-digit % of the 150-pt budget per device. No per-keystroke
search in v1.

## Phases

**Phase 0 — plumbing (S)**: proxy entries, env vars (`SPOONACULAR_KEY`),
`recipes.ts` types + adapters + specs with recorded fixtures.

**Phase 1 — dish of the day (M)**: seeded daily pick from TheMealDB,
`useRecipes` store, card on `Menu.tsx` (next to the gym's kitchen card —
info next to its action) with image, Spanish title (static translation via
LLM at fetch time), link to full recipe. Offline/sample fallback.

**Phase 2 — nutrition targets (M)**: `nutrition-target.ts` + specs;
surface the computed target on the member's plan view (it is useful alone).

**Phase 3 — plan-aligned suggestions (M/L)**: Spoonacular query built from
the target, 3–5 suggestions with kcal/protein badges and images on
`Today.tsx` (or the plan view), deterministic ranking as the no-key path.

**Phase 4 — LLM curation (M)**: `recipe-coach.ts` pass ordering and
annotating the picks in Spanish; feature-flagged like `aiCoachEnabled`,
deterministic fallback always available.

**Phase 5 — housekeeping (S)**: ATTRIBUTION.md entries (TheMealDB,
Spoonacular) + Settings → About; document cache/ToS constraints.

## Risks / open questions

- **TheMealDB app-store clause**: docs ask public app-store releases to
  become a supporter (~$10). Cheap; decide before shipping, record in
  ATTRIBUTION.md like the RepDB open question.
- **Spoonacular caching ToS**: free tier allows attribution-required use;
  verify how long responses may be cached (we keep ≤24h, which is
  conventional, but confirm before launch).
- **Spanish quality**: both catalogues are English-first. If LLM
  translation reads poorly, fall back to showing the original title with a
  Spanish coach note only.
- **No backend yet**: per-device fetching duplicates calls across devices.
  Acceptable now; when the phase-two backend lands (see PANELS.md), move
  the daily fetch server-side and fan out via the message bus.
