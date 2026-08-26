# Darebee study: what to steal and how to build it

Status: proposed (deep research done, no code yet)
Date: 2026-08-26

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

## Architecture

All local-first, consistent with existing patterns. New code in English,
member-facing copy in Spanish.

```
lib                              store                    UI
challenge.ts (types, schedule    useChallenges.ts         routes/Challenges.tsx
  math, countdown/ascending)       (per-profile persist)  challenge-card.tsx (calendar)
daily-pick.ts (date-seeded       useSession (extend:      Today.tsx (EotD card,
  exercise/quick-workout pick)     intensity, EC)           intensity picker, confetti)
fitness-test.ts (protocol,       —                        routes/FitnessTest.tsx
  scoring → {cardio, strength})
alternatives.ts (same-muscle     —                        exercise sheet in Today,
  candidate ranking)                                        Library rows
session-card.tsx (render) + export via SVG→PNG (no new deps if possible;
  else satori/html-to-image — decide in phase)
messages.ts (extend GymMessage:  useMessages (as is)      gym composer + inbox cards
  kind 'challenge' | 'collection')
```

Key type sketches (final signatures at phase planning):

```ts
interface Challenge {
  id: string; name: string; exerciseId: string
  days: number            // 30
  reps: (day: number) => number  // stored as {start, delta} not a fn
  direction: 'asc' | 'countdown'
  startedAt?: string; completedDays: string[]  // ISO dates
  source: 'bundled' | 'gym'; gymMessageId?: string
}

interface SessionSettings { intensity: 'I' | 'II' | 'III' }
// Workout gains: intensity?: 'I'|'II'|'III'; ec?: boolean
// GeneratedDay gains: ecNote?: string (validated like coachNotes)
```

Scaling math, streak/completion logic, test scoring: pure functions with
specs, same validation boundary as ai-plan.ts (the LLM never negotiates
arithmetic).

## Phases

Ordered by value/effort. Each phase ships alone and gets its own detailed
task plan (superpowers writing-plans format) before execution.

**Phase 1 — habit quick wins (S/M)**: EC flag on finish + History badge;
confetti/summary celebration on session finish; Library "hechos" filter +
done counters from history; "Sorpréndeme" (random library exercise / quick
bodyweight circuit). No new routes.

**Phase 2 — daily rotation (S)**: `daily-pick.ts` date-seeded Exercise of
the Day card on Today (form cues from library instructions). Composes with
the dish-of-the-day card from the recipes plan.

**Phase 3 — intensity I/II/III (M)**: session-level volume picker at start
of workout; set-count scaling in the runner; stored on `Workout`; shown in
History and stats.

**Phase 4 — challenges (L)**: `challenge.ts` + store + calendar card UI +
3–5 bundled Spanish challenges (sentadillas countdown, plancha ascendente,
flexiones...). Then the `challenge` GymMessage kind: gym composer form,
member inbox card with "unirme", participation tally for the gym panel.

**Phase 5 — session card / poster export (M/L)**: shareable one-image
render of a planned day or completed session; PNG export + Web Share API;
"imprimir para la pared" from the gym panel. Decide render path (inline SVG
first; add a lib only if needed).

**Phase 6 — fitness test (M)**: guided 5-min test route, scoring to
cardio/strength levels, pre-fills onboarding, dashboard chip + 8-week retest
nudge via existing notify seam.

**Phase 7 — alternatives + easier/harder (M)**: `alternatives.ts` ranking
same-muscle substitutes; swap action in Today's exercise sheet; coach
one-liners on AI plans (validated text, deterministic fallback = top
alternative names).

**Phase 8 — collections (M)**: gym-curated hubs via `collection` message
kind (title, blurb, exerciseIds); member browse view; 2–3 bundled defaults
("oficina", "sin material", "vuelta al gym").

**Phase 9 — story program (XL, flag)**: one original 30-day Spanish
narrative (own IP, own names) with day-3 track choice, travel-costs-reps
map, rotation-based recovery. Static authored content + local state; MiniMax
only for flavor text, never for structure. Only after 4–8 prove engagement.

## Risks / open questions

- **Copyright discipline**: never copy Darebee posters, figures, program
  names, or copy. Original illustrations are the hard part of phase 5 — the
  existing `movement-frames.tsx` style is the seed of our own grammar.
- **Set-scaling vs AI plans**: intensity multipliers must respect the plan
  generator's weekly volume guarantees; scaling applies at session runtime,
  never mutates the stored plan.
- **Challenge messages on a device-level bus**: joining/progress is member
  data (encrypted profile), only the challenge definition travels the
  plaintext bus — same split as offers (definition public, saved state
  per profile).
- **Poster export tech**: inline SVG → canvas → PNG has font-embedding
  gotchas with variable fonts; spike before committing phase 5.
- **Story program cost**: pure content work (~30 chapters of Spanish prose).
  Cheap to prototype one week; do not build the map engine before the
  narrative proves out.

## Sources

darebee.com: /manual.html, /workout.html, /workouts.html, /programs.html,
/challenges.html, /collections.html, /get-started.html, /fitness-test.html,
/daily.html, /wod.html, /faq/how-we-plan-wods.html, /about.html,
/support.html; program pages hero-journey, age-of-pandora, 30-days-of-hiit;
workout pages nine-to-five, sander, shoulder-fix, strength-and-power;
challenge page burpee-countdown; community.darebee.com (EC threads, Age of
Pandora help, retired-nutrition announcement); darebeets.com (/mealplans.html,
easy-7-day-menu, basic-daily-plan, recipe pages).
