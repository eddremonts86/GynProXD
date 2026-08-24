# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Hybrid athlete (calisthenics + barbell) training 2–5×/week, 45–120 min/session, training at gym, at home, or mixed. Wants a plan without cloud, without subscription, that respects real time. Example: 40-year-old male, 140kg → 80kg, 3×/week 2h, needs realistic timeline.

Secondary: Intermediate gym user tracking progression (linear/double), PRs, history. Uses phone mid-workout with gloves/sweat, needs quick logging and rest timer. Also beginner who needs guidance on what to do each day.

Jobs: (1) generate a realistic monthly/quarterly/semestral/annual plan from 4–6 small inputs; (2) follow a guided workout (preload, log sets, rest timer, wake lock, PR badge, progression suggestion); (3) browse/edit weekly planner and library of 873 movements; (4) review history and export/import JSON locally.

## Product Purpose

Forma (evolved from GynProXD) is a local-first gym tracker that helps you plan, train, and track offline. No account, no server. You tell it a few things — goal, level, effort (hours + intensity), availability, equipment — and it estimates realistic months (e.g., 60kg loss not in 1 month) and generates a periodized calendar that syncs to a weekly planner. Success is: starting a workout in one tap, logging sets fast, seeing progress, and staying offline (PWA).

## Positioning

Local-first, realistic, hybrid. Unlike cloud trackers that promise miracles, Forma calculates a safe rate (0.4–1.0 kg/week for fat loss, 0.06–0.35 for muscle) and refuses unrealistic timelines, then builds a periodized program from the 873 public-domain movements with deloads, progression rules, and warm human data. Clean-room rebuild, no openGym code/assets.

## Operating Context

- Web SPA: Vite 8 + React 19 + TypeScript + TanStack Router/Query + Zustand persist (localStorage key `gynproxd-v2`) + Tailwind v4. No backend, no auth. PWA via vite-plugin-pwa (Workbox, jsDelivr image cache).
- Routes: `/` Today (guided workout), `/onboarding` (generative), `/generated/$id` (calendar), `/planner` (weekly), `/library` (873), `/history`, `/settings`. Desktop-first requested (current is mobile-first, to be inverted).
- Workflows: onboarding → estimation card → generate → calendar → save to planner → start workout from plan → log sets → finish → history.
- Materials: exercise data `yuhonas/free-exercise-db` via jsDelivr CDN, images lazy, 3D abstract illustrations (amber sphere).
- Rituals: weekly planning, mid-workout logging with rest timer 90s and wake lock.

## Capabilities and Constraints

**Capabilities:** 873 exercises merged with customs, lookup cache, epley 1RM, `suggestNext` linear/double, `isPersonalRecord`, bodyweight log, workout persist, plans + generatedPlans, onboarding parse (regex), estimation engine, plan generator (splits 2–6 days, deload every 4th week), calendar, PWA offline.

**Constraints:** No server, no sync, no medical advice (disclaimer), localStorage only, images not bundled, must keep 873 dataset public-domain, must not copy openGym.

**Undecided:** Nutrition/macros, LLM cloud, social, backend sync — out of scope v1.

## Brand Commitments

- Name: Forma (evolved from GynProXD). Wordmark `F` amber gradient, `Forma` Instrument Serif, `local training` 10px uppercase. Theme Noir Warm: `#1a1816` surface, `#26231f` card, `#d98e3f` amber accent, `#b8afa6` muted, `#f5ede4` ink. Display serif + Inter + JetBrains Mono.
- Voice: editorial warm human, not clinical. 3D abstract hero/plate/orb, not stock gym photos. References Strava/Whoop/Hevy for warm data.
- Asset: hero.png 343×361, pwa icons 192/512 via sips, favicon.svg.

## Evidence on Hand

- Live app at `http://localhost:3015` (dev, strictPort) and `dist` with PWA manifest `Forma` theme `#1a1816`.
- Dataset `src/data/exercises-generated.ts` 873, lib `src/lib/exercises.ts`, `progression.ts`, `plan-estimate.ts`, `plan-generator.ts`, `onboarding-parse.ts` with tests 26/26.
- Screenshots `docs/impeccable/shots/*` before/after/radical/final/gen-final, walk reports.

## Product Principles

1. Realistic over optimistic — refuse miracle timelines, show math.
2. Local-first, warm data — offline, private, human, not neon.
3. Hybrid by default — calisthenics + barbell share one planner.
4. Effort is hours + intensity — both tune volume and progression.
5. Periodized, not repeated — deloads and blocks, not endless loop.

## Accessibility & Inclusion

Mobile web is phone-first mid-workout, but redesign is desktop-first as requested. Must keep touch targets ≥44px, focus-visible amber ring, keyboard navigable, safe-area inset, reduced motion respected. Color contrast on amber/ink must meet AA.
