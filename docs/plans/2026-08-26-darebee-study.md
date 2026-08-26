# Darebee study: what to steal and how to build it

Status: implemented — phases 0–8 shipped 2026-08-26 (phase 9 still a plan)
Date: 2026-08-26

Decisions locked with Edd 2026-08-26: scope is phases 0–8 (phase 9 stays a
future plan); full bus extension (both `challenge` and `collection` kinds,
gym-publishable); poster export may add a small rasterising dependency if
the no-deps spike fails; intensity target sets are I=2 / II=3 / III=4.

## Goal

Deep competitive study of darebee.com (and its nutrition sister site
darebeets.com), then a phased implementation plan for adopting their best
ideas in enForma. Ideas are not copyrightable; their posters, illustrations,
copy, and names (Hero's Journey, Age of Pandora, DAREBEE branding) ARE — the
same clean-room posture as SPEC.md. Everything below is re-implemented
original work in enForma's own visual language.

## Research: how Darebee works (verified live 2026-08-26)

Three parallel research passes: training content, nutrition/knowledge, and
UX/gamification. Full details in the sections below; sources at the end.

### Content taxonomy — commitment ladder

Each content type is a distinct *commitment level*, and that is the core IA
insight:

| Type | Count | Unit | Mechanic |
|---|---|---|---|
| Workout | ~2,800 | single session, one poster | circuit/classic sets, self-scaled |
| Training plan | dozens | 7 days | middle commitment |
| Challenge | 170+ | 1 exercise × 30 days | ±1 rep per day, calendar card |
| Program | 95+ | 30–60 days | fixed rotation, some story-driven (RPG) |
| Collection | 180+ | curated hub | life-situation-shaped, not muscle-shaped |

Onboarding asks "how much are you committing?" before "what do you want to
train?" — program vs weekly plan vs single workouts.

### The four difficulty dials (their best mechanical idea)

1. **Complexity, level 1–5** — what the moves are (1 = seated/standing
   mobility, 5 = advanced calisthenics). A browse-time filter.
2. **Volume, level I–III** — how much you do: **I = 3 sets, II = 5 sets,
   III = 7 sets**, printed on every poster. Chosen at execution time. One
   authored workout serves every member level at zero extra content cost.
3. **Rest** — scales inversely with ambition (I ≤2 min, II ≤60 s, III ≤30 s;
   circuits rest only between full circuits).
4. **EC (Extra Credit)** — one optional hardship line per workout ("no rest
   between sets", "3-min wall sit instead of 2"). Logging "with EC" is
   community vocabulary — a self-assigned achievement with zero backend.

Plus per-workout "Make it Harder / Make it Easier" one-liners and an
exercise-alternatives system for substitutions.

### The poster: the atomic product

One self-contained image per workout: header (name, tags), a grid of flat
vector figures (two figures = dynamic move, one = static hold), rep strip
under each panel, footer with the I/II/III ladder + rest rule + EC line.
Shareable as a unit, printable, offline, screenshot-proof; it was their
growth engine (Pinterest/Tumblr). It also forces content discipline: a
workout must fit one card.

### Challenges

One exercise, 30 days, a rep count per day (±1 daily). The clever variant is
the **countdown** (30 → 1 burpees): hard days land while motivation is high,
descending reps give psychological momentum. The poster is a tappable
calendar; done state saves locally; confetti on completion.

### Story programs (RPG)

Their crown jewels, 60-day retention machines:

- Narrative frames each day's workout (effort = the character's survival).
- **Day-3 specialization choice**: pick a "weapon" a few days *into* the
  program (when you know something), each weapon = a fitness track that
  unlocks scaling bonus workloads.
- **Travel costs exercise** (Age of Pandora): moving on the story map costs
  reps; side quests = optional workouts; inventory + "scraps" currency.
- No rest days — recovery is built into the rotation (light formats follow
  heavy ones) so streaks never break.

### Daily rotation + tracking

Workout of the Day (scheduled weeks ahead, editorial balance rules published
openly), Exercise of the Day, Monthly Challenge. DONE buttons everywhere with
per-item counters ("done 5 since August 2026"), **done/not-done as a catalog
filter**, bookmarks, dashboard, "Surprise Me" random pick, confetti +
"Log again" — all local-first, no account required. That maps 1:1 to
enForma's architecture.

### Nutrition (darebeets.com)

Darebee *retired* on-site meal plans/recipes ("the nutrition landscape
changes too fast") and moved to a dedicated recipes site. What remains is
tight: recipes with per-portion macros + a micronutrient highlights line,
step-by-step photos/GIFs per step, rich filters (type, meal, dietary,
equipment, cook time, **calorie band**, difficulty), "Surprise Me", and only
3 opinionated meal plans — one prescriptive 7-day menu with a repeating
pattern (5 distinct day types across 7 days, batch-cooking friendly), one
mix-and-match category framework, one hybrid. Lesson: skip the encyclopedic
nutrition KB; ship filtered recipes + 2–3 opinionated plans.

### Diagnostics

No BMI/calorie calculators. Their tools *match content to the user*: a
5–8 min no-equipment **fitness test outputting two levels (cardio +
strength)** that map directly to the content difficulty filters, with a
retest nudge every ~2 months; and a short setup quiz (goal, time,
circumstances → "start with this at this level").

### Product model

Free, ad-free, donation-funded since 2012. Trust levers: honest live
counters, published content cadence, zero dark patterns. Community
("The Hive") is check-in journals + reaction-only encouragement — no
leaderboards. Their moat is **coherence**: one visual grammar and one
difficulty vocabulary across 2,800 workouts.

## What enForma already has (mapping)

- Session logging, history, e1RM, muscle volume, bodyweight — Today/History.
- AI plan generator (MiniMax coach, validated locally) — Onboarding/Planner.
- Exercise library (free-exercise-db, ~870 entries) with muscle/equipment.
- Gym message bus (announcement/event/menu/offer) + roles member/gym/admin.
- Recipes plan already proposed (2026-08-26-recipe-recommendations.md).
- Local-first, encrypted profiles, PWA — same "no account" ethos as Darebee.

Gap analysis: enForma is a *tracker with a planner*; Darebee is a *content
system with self-scaling artifacts and habit loops*. The steal is the content
grammar + the habit mechanics, not their catalog.

## Decisions (what we steal, adapted)

1. **Session card (poster)** — every planned day / logged workout renders as
   one self-contained shareable card in enForma's visual language (Geist +
   dark theme + movement frames). Print/PNG export. The gym role gets
   "print for the wall".
2. **Volume levels I/II/III** — a per-session intensity picker that scales
   the day's sets 3/5/7-style (×0.75 / ×1 / ×1.25 rounded, min 2 sets).
   Complexity stays where it already lives (member `Level`).
3. **EC flag** — each generated day can carry one `ecNote` (coach-written or
   template); finishing a session offers one tap "con EC". Stored on
   `Workout`, badged in History.
4. **Challenges** — 30-day single-exercise challenges with daily rep deltas
   (ascending and countdown), rendered as a tappable calendar card. Members
   can start bundled challenges; the **gym role publishes challenges** via a
   new `challenge` message kind (fits the bus exactly like menus/offers).
5. **Daily rotation** — Exercise of the Day (form focus, from the library,
   seeded by date — same deterministic pattern as the dish of the day) on
   Today, next to a "Sorpréndeme" quick-workout button.
6. **Done/not-done + counters** — Library filter "hechos / no hechos"
   (computable from history) and per-exercise "done N times" chips.
7. **Celebrations** — confetti + summary card on session finish, challenge
   day taps, and challenge completion. One reward system across all types.
8. **Fitness test** — 5-min guided test producing cardio + strength levels
   that pre-fill onboarding (`level`, `effort`) instead of pure
   self-declaration. Retest nudge every 8 weeks.
9. **Make it easier/harder + alternatives** — per-exercise alternatives
   (same muscle, different equipment/difficulty) surfaced in Today's
   exercise sheet; coach one-liners where the AI plan exists.
10. **Collections** — gym-curated, life-situation-shaped hubs ("oficina",
    "post-lesión", "vuelta al gym") assembled from the library; published
    through the bus, browsable by members.
11. **Story program** — ONE original Spanish 30-day narrative program with a
    day-3 track choice and travel-costs-reps map. Ambitious, last phase,
    feature-flagged.

Explicitly NOT stolen: their illustrations/posters/names (copyright), the
donation model (n/a), forums (needs backend), plant-based-only nutrition
(recipes plan already covers food), and an encyclopedic article KB (their own
retreat from nutrition articles is the warning).

Recipe cross-pollination (goes into the existing recipes plan, not here):
calorie-band + cook-time filters, "Sorpréndeme" button, repeating-pattern
7-day menu (5 day types), per-portion macros + micronutrient line.

## Fit check against the codebase (2026-08-26 audit)

Three parallel code audits (session flow, planner/generator, bus/library/
recipes) validated every phase against the real code. Findings that change
the plan:

1. **The data model has no set counts — phase 3 as first written had
   nothing to multiply.** `PlannedExercise` is `{exerciseId, progression,
   supersetGroup?, timed?, unilateral?}` (types.ts:65) and volume is fully
   emergent: the member taps "Log set" as many times as they like
   (useGym.ts:133). Phase 3 is re-specced below: intensity selects a
   session-local `targetSets` goal introduced at the single plan→session
   boundary (`startWorkoutFromPlan`, useGym.ts:112), never a multiplier
   over stored plans.
2. **Progression interaction**: double progression fires when *every*
   logged set hits max reps (progression.ts:50) — fewer sets makes weight
   increases *easier* to trigger. `suggestNext` needs a ≥3-sets guard
   before proposing +2.5 kg. Runtime intensity must NOT feed
   `estimatePlan`'s rate/timeline contract; it is a session dial, and must
   not be named "effort" (that name is taken by the plan-design dial,
   types.ts:107).
3. **`ecNote` must live on `PlannedDay`, not only `GeneratedDay`** —
   `saveGeneratedAsPlan` copies to a `WeeklyPlan`, which would drop it.
   Validation follows the `cleanText` boundary (ai-plan.ts:93); the
   deterministic generator needs a template fallback or standard plans
   have no EC line.
4. **No share/print/canvas code exists anywhere** (zero hits for
   navigator.share, toBlob, window.print). Poster export must use the
   *local* illustrations (`/repdb/*.webp`, 384/873 coverage, precached)
   plus the typographic tile fallback — the CDN photos would taint any
   canvas, and `ExerciseThumb`'s stateful fallback can't be serialised.
5. **Bus extension is mechanical but not data-driven**: adding a kind
   touches ~18 sites (3 compile-forced, the rest silent — composer state
   bag, draft/validity branches, publish call, reset block, copy chains,
   card render, Inbox threading). Budget for it; specs don't enumerate
   kinds, so no test churn.
6. **Latent bug that long-lived kinds would expose**: gym matching is by
   name string, and `renameGymEverywhere`/`deleteGymEverywhere`
   (profiles.ts:160/174) never rewrite `GymMessage.gym`. Harmless for
   minutes-lived banners; fatal for 30-day challenges. Fix before phase 4.
7. **The daily-pick idiom is already solved**: `seedFrom` (FNV-1a,
   recipes.ts:50) + date-keyed pick, specced deterministic. It must move
   out of `recipes.ts` (layering) to a neutral module before training
   features import it. An exercise-of-the-day over the 873 bundled
   entries is a pure function — no store, no network, simpler than the
   dish.
8. **Member-private vs bus split confirmed**: challenge *definition* and
   join tally ride the plaintext bus (mirror `toggleSaved`,
   useMessages.ts:127); *progress* goes in the encrypted `GymSnapshot`
   (useGym.ts:360) whose `hydrateGym` already tolerates new optional
   fields. Bundled challenges do NOT go on the bus — they follow the
   `SAMPLE_SUGGESTIONS` pattern (typed array, provenance discriminator,
   never persisted as if live).
9. **Celebrations have a design constraint**: DESIGN.md limits motion to
   confirming state, with `useReducedMotion` mandatory (already wired in
   Today). There is no finish-summary UI at all today — `finishWorkout`
   just flips back to the overview. The win is a finish summary card
   (totals, PRs, duration from the unused `startedAt`/`endedAt`) with a
   restrained flourish, not a confetti lib.
10. **Fitness-test seam exists**: the `profileDetails` lazy-prefill
    precedent (Onboarding.tsx:36) plus an explicit "usar mi resultado"
    action à la `applyParsed`. Caveat: on AI-coached plans `effort` only
    affects the timeline, and `level` affects exercise picking — the test
    should feed *both*, with expectations set accordingly. The retest
    nudge must be an on-unlock check with a *persisted* marker (the
    `seenUnread` ref pattern resets per boot) and needs its own
    notification pref — the existing toggle is labelled "Gym messages".
11. **Recipes plan is already fully implemented but uncommitted** (all 10
    files untracked on `dev`). Commit it before starting any of this.
12. **Done-counters logic already exists inline** in History's
    StrengthChart options memo (History.tsx:152) — extract to
    `stats.ts` as `sessionCountsByExercise(workouts)` and reuse for the
    Library filter and per-card chips.

## Architecture

All local-first, consistent with existing patterns. New code in English,
member-facing copy in Spanish.

```
lib                              store                    UI
seed.ts (seedFrom moved here;    —                        —
  recipes.ts re-imports)
challenge.ts (types, schedule    useGym (GymSnapshot      routes/Challenges.tsx
  math, countdown/ascending)       gains challenges[])    challenge-card.tsx (calendar)
daily-pick.ts (pure exercise-    —                        Today.tsx (EotD card +
  of-the-day over bundled set)                              "Sorpréndeme" in Section action)
fitness-test.ts (protocol,       useGym (profileDetails-  routes/FitnessTest.tsx
  scoring → {cardio, strength})    style fitnessTest field)
alternatives.ts (same-muscle     —                        exercise sheet in Today,
  candidate ranking)                                        Library rows
session-card.tsx (own image      —                        GeneratedPlan/Planner day,
  resolution: /repdb webp +                                 gym panel "print"
  typographic fallback)
stats.ts (extract                —                        Library filter + chips,
  sessionCountsByExercise)                                  History (already inline)
messages.ts (extend GymMessage:  useMessages (widen       gym composer + inbox cards
  kind 'challenge'|'collection')   PublishInput)
data/sample-challenges.ts (bundled, SAMPLE_SUGGESTIONS pattern)
```

Key type sketches (final signatures at phase planning):

```ts
interface Challenge {
  id: string; name: string; exerciseId: string
  days: number                       // 30
  start: number; delta: number       // reps(day) = start + delta * (day - 1)
  direction: 'asc' | 'countdown'     // countdown = negative delta, ends at 1
}
// member progress, inside encrypted GymSnapshot:
interface ChallengeState { challengeId: string; startedAt: string; completedDays: string[] }

// Workout gains: intensity?: 'I'|'II'|'III'; ec?: boolean
// LoggedExercise gains: targetSets?: number   // set at startWorkoutFromPlan,
//   I=2 II=3 III=4 (deload floor rules apply); a goal, never a cap
// PlannedDay + GeneratedDay gain: ecNote?: string (cleanText ≤120,
//   deterministic template fallback in plan-generator)
```

Scaling math, streak/completion logic, test scoring: pure functions with
specs, same validation boundary as ai-plan.ts (the LLM never negotiates
arithmetic). Intensity/targetSets live on the session record only —
`state.plans` is never mutated and `estimatePlan`'s timeline contract is
untouched.

## Phases

Ordered by value/effort. Phases 0–8 are implemented and committed on `dev`;
each was verified in the browser, not only by tests. What landed, per phase,
plus the deviations worth knowing:

- **0** `seed.ts`, `stats.sessionCountsByExercise`. The gym-rename bug in the
  fit check turned out to be already handled: `Admin.doRename` calls
  `useMessages.renameGym` and `useMenus.renameGym` alongside
  `renameGymEverywhere`. No fix needed.
- **1** `Workout.ec`, finish-summary card, EC + duration badges, library
  done filter and counts.
- **2** `daily-pick.ts` (pure, no store — simpler than the dish of the day),
  movement-of-the-day card with an injected-RNG reroll.
- **3** `targetSets` on the session's `LoggedExercise` at
  `startWorkoutFromPlan` + live `setSessionIntensity`, I/II/III = 2/3/4,
  logged-vs-target chips, `Workout.intensity`. Plus the progression guard:
  double progression now needs three sets of evidence.
- **4** `challenge.ts` + 4 bundled challenges + `/challenges` + the
  `challenge` bus kind with a joined tally. Progress lives in the encrypted
  `GymSnapshot`; the definition is copied on join. **Found and fixed while
  verifying**: the 400 ms autosave debounce could lose the last writes to a
  full page navigation — `profiles.ts` now also flushes on `pagehide`.
- **5** `session-card.ts` renders posters on a canvas (not SVG — the loaded
  Geist faces just work, and only same-origin `/repdb` illustrations are
  drawn so export can never taint). Share sheet with download fallback from
  the finish summary, history rows, today's day, and a challenge wall
  poster in the gym's sent list.
- **6** `fitness-test.ts` + `/fitness-test`, prefilling the designer's level
  and effort; retest at 8 weeks shown in-app and, opt-in, as one
  notification per stale test on a **separate** `training` channel.
- **7** `alternatives.ts` + a swap control in the session focus card
  (logged sets are never discarded), and `ecNote` per day: coach-written
  through `cleanText`, six rotating templates on the standard path, dropped
  on deload weeks, living on `PlannedDay` so it survives the planner copy.
- **8** `collection.ts` + 3 bundled hubs + the `collection` bus kind;
  members get them as library filter chips, gym-curated first.

Phase 9 keeps its own plan below and has not been started.

**Phase 0 — prerequisites (S)**: commit the recipes work sitting
untracked on `dev`; move `seedFrom` to `src/lib/seed.ts` (recipes re-import,
specs move with it); extract `sessionCountsByExercise` from History's
inline memo into `stats.ts` with a spec; fix
`renameGymEverywhere`/`deleteGymEverywhere` to rewrite/remove matching
`GymMessage.gym` values.

**Phase 1 — habit quick wins (S/M)**: `ec?: boolean` on `Workout`
(one-tap "con EC" in `SessionHeader` next to Finish, written in the
`finishWorkout` literal); finish-summary card (totals, PRs, duration from
the currently-unused `startedAt`/`endedAt`) with a restrained
reduced-motion-safe flourish — DESIGN.md-compliant, no confetti lib; EC +
duration badges in History's session rows and Today's RecentSessions;
Library "hechos/no hechos" filter + done-count chips from
`sessionCountsByExercise`. No new routes.

**Phase 2 — daily rotation (S)**: `daily-pick.ts` pure
`exerciseOfTheDay(dateIso)` over the bundled 873 (no store, no network),
specced deterministic; card at the Today slot right before
`<MealSuggestions/>` (training above food, present in all three overview
branches — it carries rest days); "Sorpréndeme" in that Section's action
slot with injected-RNG testability (the `makeOfferCode` idiom).

**Phase 3 — intensity + target sets (M)**: introduce `targetSets` on the
session's `LoggedExercise` at `startWorkoutFromPlan` (I=2, II=3, III=4;
respects deload's `Math.max(2, …)` idiom); picker beside "Start session"
in the day-panel header + live in `SessionHeader`; progress shown as
logged-vs-target chips; `intensity` stored on `Workout`, badged in
History; guard `suggestNext` double progression behind ≥3 logged sets.
Never mutates plans, never feeds `estimatePlan`, never named "effort".

**Phase 4 — challenges (L)**: `challenge.ts` math + specs;
`data/sample-challenges.ts` (3–5 bundled Spanish challenges: sentadillas
countdown, plancha ascendente, flexiones...); member progress as
`ChallengeState[]` in the encrypted `GymSnapshot` (tolerant `hydrateGym`
default); tappable calendar card + `/challenges` route. Then the
`challenge` GymMessage kind across the ~18 composer/card/inbox sites,
"unirme" mirroring `toggleSaved`, joined-count tally in the gym panel's
sent list.

**Phase 5 — session card / poster export (M/L)**: shareable one-image
render of a planned day or completed session. Own image-resolution path:
local `/repdb/*.webp` illustrations (384/873) + the typographic
muscle-tile fallback — never the CDN photos (canvas taint), never
`ExerciseThumb` (stateful). Spike inline-SVG → canvas → PNG with the
variable fonts first; Web Share API + the existing Blob-download idiom;
print stylesheet for the gym panel ("imprimir para la pared").

**Phase 6 — fitness test (M)**: guided 5-min test route scoring to
cardio/strength levels; result stored `profileDetails`-style in the
encrypted snapshot; prefills Onboarding `level` AND `effort` via the lazy
initializer + an explicit "usar mi resultado" action (the `applyParsed`
model); 8-week retest nudge as an on-unlock check with a persisted marker
and its own notification pref (the existing toggle is "Gym messages");
in-app chip is primary — system notification has no click routing under
generateSW.

**Phase 7 — alternatives + easier/harder (M)**: `alternatives.ts` ranking
same-muscle substitutes over the bundled fields; swap action in Today's
exercise sheet (note `plannedOptionsFor` is first-match-wins across
plans); coach `ecNote`/one-liners on `PlannedDay` + `GeneratedDay`
(cleanText ≤120, prompt shape updated, deterministic template fallback in
`plan-generator`), rendered in the DayCard footer and day dialog.

**Phase 8 — collections (M)**: gym-curated hubs via `collection` message
kind (title, blurb, exerciseIds) — same touchpoint list as phase 4's kind;
member browse view; 2–3 bundled defaults ("oficina", "sin material",
"vuelta al gym") following the sample-content pattern.

**Phase 9 — story program (XL, flag)**: one original 30-day Spanish
narrative (own IP, own names) with day-3 track choice, travel-costs-reps
map, rotation-based recovery. Static authored content + local state; MiniMax
only for flavor text, never for structure. Only after 4–8 prove engagement.

## Risks / open questions

- **Copyright discipline**: never copy Darebee posters, figures, program
  names, or copy. Original visuals are the hard part of phase 5 — note
  `movement-frames.tsx` is a photo-pair renderer, not an illustration
  system; our poster grammar starts from the `/repdb` illustrations and
  the typographic tiles.
- **targetSets is a new design decision, not a multiplier**: the generator
  has never prescribed volume (it is emergent from logging). Introducing a
  target changes the app's philosophy from "log what you did" toward
  "here is the goal" — keep it a soft goal (chips), never a cap or a
  nag, and watch whether members read it as pressure.
- **Intensity vs deload**: decide explicitly whether the I/II/III picker
  applies on deload weeks (deload already halves the day by dropping
  exercises); default proposal: picker hidden on deload days.
- **Poster export tech**: inline SVG → canvas → PNG has font-embedding
  gotchas with the variable fonts (Geist); spike before committing
  phase 5. Local-image constraint is hard (CDN photos taint the canvas).
- **Bus growth**: two new kinds double the composer's flat state bag
  (~18 touchpoints each). If a third kind ever lands, refactor the
  composer to a per-kind descriptor registry first.
- **Story program cost**: pure content work (~30 chapters of Spanish prose).
  Cheap to prototype one week; do not build the map engine before the
  narrative proves out.
- **Import compatibility**: every new persisted field (`ec`, `intensity`,
  `targetSets`, `ecNote`, `challenges`, `fitnessTest`) must be optional —
  `importData` does no schema validation and old backups must keep
  loading (the `source`/`coachNotes` precedent).

## Sources

darebee.com: /manual.html, /workout.html, /workouts.html, /programs.html,
/challenges.html, /collections.html, /get-started.html, /fitness-test.html,
/daily.html, /wod.html, /faq/how-we-plan-wods.html, /about.html,
/support.html; program pages hero-journey, age-of-pandora, 30-days-of-hiit;
workout pages nine-to-five, sander, shoulder-fix, strength-and-power;
challenge page burpee-countdown; community.darebee.com (EC threads, Age of
Pandora help, retired-nutrition announcement); darebeets.com (/mealplans.html,
easy-7-day-menu, basic-daily-plan, recipe pages).
