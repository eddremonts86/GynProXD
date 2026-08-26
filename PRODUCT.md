# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Hybrid athlete (calisthenics + barbell) training 2–5×/week, 45–120 min/session, training at gym, at home, or mixed. Wants a plan without cloud, without subscription, that respects real time. Example: 40-year-old male, 140kg → 80kg, 3×/week 2h, needs realistic timeline.

Secondary: Intermediate gym user tracking progression (linear/double), PRs, history. Uses phone mid-workout with gloves/sweat, needs quick logging and rest timer. Also beginner who needs guidance on what to do each day.

Jobs: (1) generate a realistic monthly/quarterly/semestral/annual plan from 4–6 small inputs; (2) follow a guided workout (preload, log sets, rest timer, wake lock, PR badge, progression suggestion); (3) browse/edit weekly planner and library of 873 movements; (4) review history and export/import JSON locally.

## Product Purpose

enForma (evolved from GynProXD) is a local-first gym tracker that helps you plan, train, and track offline. No account, no server. You tell it a few things — goal, level, effort (hours + intensity), availability, equipment — and it estimates realistic months (e.g., 60kg loss not in 1 month) and generates a periodized calendar that syncs to a weekly planner. Success is: starting a workout in one tap, logging sets fast, seeing progress, and staying offline (PWA).

## Positioning

Local-first, realistic, hybrid. Unlike cloud trackers that promise miracles, enForma calculates a safe rate (0.4–1.0 kg/week for fat loss, 0.06–0.35 for muscle) and refuses unrealistic timelines, then builds a periodized program from the 873 public-domain movements with deloads, progression rules, and warm human data. Clean-room rebuild, no openGym code/assets.

## Operating Context

- Web SPA: Vite 8 + React 19 + TypeScript + TanStack Router/Query + Zustand (memory) + Tailwind v4. No backend. Local profiles with passphrase-derived AES-GCM encryption at rest; the old plaintext `gynproxd-v2` store migrates into the first profile. PWA via vite-plugin-pwa (Workbox, jsDelivr image cache).
- Routes: `/` Today and the live session, `/onboarding` (plan builder), `/generated/$id` (calendar), `/planner` (weekly), `/library` (873), `/history`, `/settings`. Onboarding is reached from empty states and Settings rather than from the navigation, because it is a setup flow rather than a destination.
- Workflows: onboarding → estimation card → generate → calendar → save to planner → start workout from plan → log sets → finish → history.
- Materials: exercise data from `yuhonas/free-exercise-db` via jsDelivr, RepDB flat illustrations bundled locally, both lazy-loaded. No decorative illustration is generated to stand in for a movement that has none.
- Rituals: weekly planning, mid-workout logging with rest timer 90s and wake lock.

## Capabilities and Constraints

**Capabilities:** 873 exercises merged with customs, lookup cache, epley 1RM, `suggestNext` linear/double, `isPersonalRecord`, bodyweight log, workout persist, plans + generatedPlans, onboarding parse (regex), estimation engine, plan generator (splits 2–6 days, deload every 4th week), calendar, PWA offline.

**Constraints:** No server, no sync, no medical advice (disclaimer), local storage only (encrypted per profile), images not bundled, must keep 873 dataset public-domain, must not copy openGym.

**Undecided:** Nutrition/macros, LLM cloud, social, backend sync — out of scope v1.

## Brand Commitments

- Name: enForma (evolved from GynProXD). The mark is four rules of decreasing length read as a measuring scale, set in cobalt; the wordmark is Geist 600. Theme "Instrument": cool graphite and chalk neutrals with one cobalt signal (`#1d47d6` light, `#6c8cff` dark), red reserved for destructive and green for personal records. Geist Variable throughout, Geist Mono for every figure.
- Voice: plain and factual, never motivational. The product's claim is that it refuses to lie about timelines, so the interface shows its arithmetic instead of dressing it up. No decorative imagery: the only pictures are real movement illustrations and photographs.
- Assets: favicon.svg plus PWA icons 180/192/512, all generated from the mark by `scripts/generate-icons.mjs`.

## Evidence on Hand

- Live app at `http://localhost:3015` (dev, strictPort) and `dist` with PWA manifest `enForma` theme `#1a1816`.
- Dataset `src/data/exercises-generated.ts` 873, lib `src/lib/exercises.ts`, `progression.ts`, `plan-estimate.ts`, `plan-generator.ts`, `onboarding-parse.ts` with tests 26/26.
- Screenshots `docs/impeccable/shots/*` before/after/radical/final/gen-final, walk reports.

## Product Principles

1. Realistic over optimistic — refuse miracle timelines, show math.
2. Local-first, warm data — offline, private, human, not neon.
3. Hybrid by default — calisthenics + barbell share one planner.
4. Effort is hours + intensity — both tune volume and progression.
5. Periodized, not repeated — deloads and blocks, not endless loop.

## Accessibility & Inclusion

Phone-first mid-session, calm on desktop for planning. Touch targets 44px or more, focus-visible cobalt ring, keyboard navigable, safe-area inset on the bottom navigation, reduced motion respected. Every text and accent pair meets WCAG AA in both themes; the theme follows the system preference until the user chooses explicitly.
