# enForma — full-app review findings (2026-08-28)

- Method: `scripts/audit/saas-review-walk.mjs` against `pnpm dev` on :3015 — 47 screenshots
  across 3 roles (gym, admin, member) + solo member, desktop light/dark + mobile 375,
  every route in `src/router.tsx` plus provoked states (404, bad plan id, gate validation,
  inbox bump, unpublished menu). Evidence in `docs/ui-audit/evidence/` (local, gitignored).
- Baseline gate before any edit: `pnpm lint` clean · `pnpm test` 152/152 · `pnpm build` green
  (pre-existing warning: one chunk > 800 kB).
- Walk health: 0 console errors/warnings, 0 failed requests, 0 px horizontal overflow on all
  47 shots, no route slower than 2.5 s on a warm dev server.
- Prior art: every finding from `docs/UI_AUDIT_REPORT.md` (2026-08-26) was fixed and verified
  on 2026-08-27. None of them re-raised here; this pass is design, copy and product-gap level.

## Findings to fix (this pass)

| ID | Sev | Where | What | Fix |
|----|-----|-------|------|-----|
| R-01 | P1 | `src/routes/Today.tsx:328` | "Weeks trained 0/12" never names its window; the sibling cards do ("last 7 days", "30 days"), so `/12` reads as programme progress that does not exist | Label → "Weeks trained, last 12" |
| R-02 | P1 | `src/routes/Today.tsx:270` | Training-volume aurora tile renders `0 kg · 0 sessions, 0 sets` for a brand-new profile. `AuroraTile` has a designed empty mode (omit `value`, `sub` takes over — Bodyweight uses it) that Today never engages, so the page's hero material is spent saying nothing three times | With no logged workout, omit `value` and let a composed line carry the tile |
| R-03 | P1 | `src/ui/ExerciseThumb.tsx` | While CDN photos load, tiles are blank boxes (the typographic muscle-code fallback only appears after the whole candidate cascade fails). A cold Library paints dozens of empty frames | Layer the muscle code under the photo so something branded shows from the first paint; photo covers it on load |
| R-04 | P1 | `src/routes/GymPanel.tsx:250` | "Published to 0 members." reads as a delivery failure. Members register on this device later and still receive the message (read-time delivery) | When the device knows no members yet, say that instead of "0 members" |
| R-05 | P1 | `src/routes/FitnessTest.tsx:140` | "Score my test" sits disabled with no explanation of what completes the test | Hint line naming the missing stations, shown while incomplete |
| R-06 | P2 | `src/routes/Story.tsx` intro | Intro panel caps text at 62ch and leaves the right half of the card empty at desktop width | Balance the panel at `lg` with a quiet brand-family glyph column |
| R-11 | P2 | `scripts/audit/saas-review-walk.mjs` | Admin fixture screenshot captured `/settings` (profile creation returns to the current route; the walker never navigated) | Walker goes to `/admin` explicitly after creating the admin |

## Feature gap promoted to implementation

| ID | Where | What |
|----|-------|------|
| F-A | `src/routes/History.tsx` + `src/lib/stats.ts` | Training consistency calendar (SPEC v2 candidate "activity heatmap", the one v2 differentiator still unshipped). GitHub-style last-26-weeks day grid coloured by logged sets, driven by local workouts only. Includes unit tests for the series builder |

## Found, not fixed (product decisions or data-dependent)

| ID | Where | What | Why not fixed here |
|----|-------|------|--------------------|
| R-07 | `src/components/dish-of-the-day.tsx` | Dish card shows a hole between tags and the recipe link when the optional coach note is absent | Self-heals when the AI coach note is configured; filling it would mean parsing TheMealDB ingredients (scope) |
| R-08 | `src/routes/Today.tsx` | With data, the aurora tile's sub line ("3 sessions, 12 sets") duplicates the two stat cards below | Which surface owns those numbers is a product call |
| R-09 | `src/routes/Settings.tsx` | Admin profiles see the "not linked to a gym" nudge and the "Design my programme" card | Admins may also train on this device; gating by role is a product call |
| R-10 | `docs/impeccable/design-system.md` | Describes the retired "Noir Warm" system (Instrument Serif, amber) while the app ships "Soft Signal" (`src/index.css`) | Superseded-note added in this pass; a full rewrite of that doc is docs work beyond the UI batch |
| — | `docs/plans/2026-08-26-backend-sync.md` | Push notifications and multi-device sync still need the phase-two backend | Separate project-sized effort |

## Considered and kept as-is

- Em-dashes in UI copy (Story intro, inbox nudge, gym panel header): the product's voice uses
  them deliberately and consistently; the landing-page em-dash ban does not apply to in-app copy.
- Gym operators keep the member rail (Today/Planner/…): operators can train too; `/gym` is one
  tap away in the utility cluster. Not dead navigation.
- Bottom-nav overlap seen mid-page in mobile screenshots: fixed-position artefact of full-page
  capture, not a layout bug (0 px overflow measured on every mobile shot).
