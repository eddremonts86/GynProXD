# GynProXD — Spec v0.1 (the project is enForma since 2026-08-26; kept as the historical record)

## Objective

A local-first gym tracker owned end to end by Edd: plan, run guided workouts, and track
progress with zero accounts and zero servers in v1.

## Legal posture (decided)

- **Clean-room rebuild.** openGym is AGPL-3.0; its code, UI strings, CSS and assets are NOT
  copied. Features/ideas are not copyrightable; the implementation here is original.
- **Exercise media:** none bundled in v1. The openGym pipeline's GIFs are © Gym Visual
  (commercial stock) — never copy them without a license.
- **Exercise dataset:** seed data written by hand (~22 exercises). Optional import from
  `yuhonas/free-exercise-db` via `scripts/import-free-exercise-db.mjs` (Unlicense / public
  domain).
- **Name:** GynProXD (no relation to "openGym" branding).

## Stack

Vite 8 + React 19 + TypeScript · TanStack Router · TanStack Query · Zustand (persist,
localStorage) · Tailwind v4. PWA + sync/backend are future blocks.

## v1 scope (this spec)

1. Today: start/finish a workout, log sets (weight × reps), quick bodyweight log.
2. Library: searchable exercise list, add custom exercises.
3. History: past workouts + bodyweight entries.
4. Settings: one-tap JSON export/import. Everything stays on-device.

## Non-goals for v1

- No auth/passkeys, no server, no sync, no PWA manifest yet.
- No progression engine / 1RM / timers / supersets (v2 candidates, listed below).

## v2 candidate features (Edd's differentiators — pick and prioritize)

- Progression rules per exercise (linear, double progression)
- Rest timer with keep-awake
- PR detection + estimated 1RM
- Weekly routine planner
- Supersets, timed exercises, reps-per-side
- Muscle-map visualization, activity heatmap
- Optional backend for multi-device sync (passkeys like openGym, but own design)

## Verification (v0.1 scaffold)

- `pnpm build` exits 0 (tsc + vite).
- Dev server serves the app; all four routes render; workout flow works in browser.
