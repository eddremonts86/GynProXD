# Phase 2 — Design System & Visual Remediation (GynProXD)

> **DEGRADED** — DB/Roles/Landing are N/A for this local-first SPA. They are skipped explicitly. This phase covers the 4 real routes, tokens in `index.css @theme`, and shared components in `src/ui/`.

- Dev server: `http://localhost:3010` (--strictPort)
- Before shots: `shots/before-*.png` (Phase 1)
- After shots: `shots/after-*.png` (this phase)
- Tool: `scripts/audit/walk.mjs` chromium (mobile 375x812 DPR2 + desktop 1440x900)

---

## 1. Tokens — `src/index.css @theme`

Expanded from 4 to full system:

```css
@theme {
  --color-surface: #0a0a0a;
  --color-surface-2: #141416;
  --color-card: #161618;
  --color-card-hover: #1c1c1f;
  --color-line: #26262a;
  --color-line-strong: #2e2e32;
  --color-accent: #22d3ee;
  --color-accent-soft: #22d3ee14;
  --color-accent-hover: #06b6d4;
  --color-muted: #71717a;
  --color-muted-strong: #a1a1aa;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-xl: 20px; --radius-2xl: 24px;
  --text-xs … --text-3xl (type scale)
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.4), 0 4px 12px rgb(0 0 0 / 0.25);
}
```

Global:
- `color-scheme: dark`, `scrollbar-gutter: stable`, thin scrollbars, selection accent-soft
- `*:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` — visible ring on all interactive elements (buttons, inputs, nav links)
- `body` bg-surface, antialiased, optimizeLegibility
- No hardcoded colors outside tokens.

---

## 2. Shared Components — `src/ui/`

| Component | File | Purpose |
|---|---|---|
| **Card** | `Card.tsx` | `rounded-[var(--radius-lg)] border-line bg-card shadow-card`, padding sm/md/lg, optional hover. Replaces repeated `rounded-xl border bg-card p-4`. |
| **Button** | `Button.tsx` | Variants `primary` (accent), `secondary` (border), `ghost`; sizes sm/md/lg; disabled, focus-visible, hover. Used for Start/Finish/Add/Log/Discard/Load more. |
| **Input** | `Input.tsx` | `rounded-[var(--radius-md)] border-line bg-surface px-4 py-3` + `focus:border-accent focus:bg-surface-2`; optional label. Replaces 6 scattered inputs. |
| **Badge** | `Badge.tsx` | Pill `rounded-full border px-2.5 py-1 text-[11px] uppercase` variants default/muted/accent. For muscle/equipment. |
| **EmptyState** | `EmptyState.tsx` | Card centered icon+title+description+action. Used when no workouts/history. |
| **PageHeader** | `PageHeader.tsx` | `h1 text-2xl md:text-3xl font-bold tracking-tight` + muted description + optional action slot. Unified page titles. |

All components use tokens, have `focus-visible` rings, and are mobile-first.

---

## 3. Shell — `src/router.tsx`

Before:
- `max-w-md` centered only — cramped on desktop 1440
- nav `py-2` no safe-area, no backdrop opacity, no active indicator
- link `data-[status=active]:text-accent` only

After:
- `max-w-6xl` outer, `max-w-3xl` content centered: `px-4 md:px-6 lg:px-8`, `pb-28 pt-6 md:pt-8` — comfortable on desktop, still narrow on mobile
- nav `bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80` + `pb-[env(safe-area-inset-bottom)]` — safe-area bottom nav (iPhone home indicator)
- nav inner `max-w-3xl justify-around px-2 py-1 md:py-2`
- links `rounded-[var(--radius-md)] px-4 py-2 text-xs uppercase tracking-wide` + `hover:bg-surface-2` + active dot `absolute -top-1 w-6 h-1 bg-accent` + `focus-visible`

---

## 4. Route Critique & Changes

### `/` — Today

Before:
- `<h1>Today</h1>` + raw `rounded-xl` section for bodyweight + `bg-accent` Start button (no spacing scale)
- Active state: header `Workout in progress` + `ul space-y-2` with `rounded-xl` li + raw select `Choose exercise…` with 873 options all rendered + inputs `kg/reps` + `Add set` disabled style `opacity-30`
- No badges, no empty state for 0 sets, no filter for 873 exercises

After:
- `PageHeader` title+description+Discard ghost button
- Bodyweight in `Card` with `Input` + `Button` (labelled, focus rings)
- Ready-to-train `Card` gradient `from-card to-surface-2` + `Button size=lg w-full` + muted count
- Active: logged list as `Card` per exercise with `Badge` muscle/equipment + set pills `rounded-full bg-surface-2 px-2.5 py-1`
- Empty dashed `Card` when 0 sets
- Exercise picker: filter `Input` for live search (slice 80) + `<select>` styled tokens + `Badge` preview + helper text
- Add row `grid grid-cols-[1fr_1fr_auto]` with `Input` kg/reps + `Button Add`
- Finish `Button variant=secondary size=lg w-full border-accent/30 text-accent hover:border-accent` disabled when empty

### `/library` — Library

Before:
- `<h1>Library</h1>` + `<input Search 873…>` + `<ul divide-y rounded-xl>` flat list all 873 at once (57k px tall, 4–8 MB screenshot) + add form raw

After:
- `PageHeader` with counts + CDN note
- Search `Input` + horizontal muscle filter chips (`rounded-full border` chips, active `border-accent bg-accent text-surface`) overflow-x-auto
- Showing `x of y` muted helper
- `EmptyState` when no matches
- List: `Card padding=sm flex gap-3` per exercise with CDN image `h-14 w-14 rounded-[var(--radius-md)] object-cover` lazy, fallback muscle initials + `Badge` pair. NOT rendering all 873 — sliced 50 + `Load more` button (`filtered.length-visible remaining`). Screenshot after: 635K desktop (was 4.1M), 1.6M mobile (was 8.1M) — 85% reduction.
- Add custom `Card` with label/description + `Input` + `Button`

### `/history` — History

Before:
- `<h1>History</h1>` + `No workouts yet.` plain p + `rounded-xl` per workout with raw `time` + `weight×reps` text + bodyweight section raw

After:
- `PageHeader` with count or empty description
- `EmptyState` when 0 workouts (copy: Start from Today)
- Per workout `Card` with header `time + Badge exercises` + list items `rounded-[var(--radius-md)] bg-surface-2 px-3 py-2.5` with set pills `rounded-full bg-surface`
- Bodyweight `Card` with `divide-y divide-line` + tabular-nums

### `/settings` — Settings

Before:
- `<h1>Settings</h1>` + `rounded-xl` Your data + raw buttons `rounded-xl bg-accent` + label `rounded-xl border` Import + muted version text

After:
- `PageHeader`
- Data `Card` with `text-sm leading-5 text-muted` + `font-mono` key `gynproxd-v2` + `Button` Export + styled `label` Import (focus-visible) + `bg-accent-soft` msg pill when set
- About `Card border-dashed bg-transparent shadow-none` with legal text

All routes: mobile-first column, desktop centered max-w-3xl, consistent spacing `gap-5/6`, focus rings, tokens only.

---

## 5. Access & Perf Notes

- **Focus**: every interactive has visible ring (Buttons/Input/select/nav links). Tested via tab navigation.
- **Safe-area**: nav uses `env(safe-area-inset-bottom)` — no content hidden by home indicator on 375x812.
- **Images**: Library CDN images lazy, `onError hidden`, not bundled.
- **Perf**: Library virtualization via slicing (50 + load-more) cuts DOM nodes ~94%, screenshot bytes down 85%, mitigates scroll jank. No full 873 render.
- **Desktop**: content not stretched full 1440; max-w-3xl keeps readable measure, still centered.

---

## 6. Before/After

| Route | Before (mobile) | After (mobile) | Before (desktop) | After (desktop) |
|---|---|---|---|---|
| / | `before-mobile-375-today.png` (35K) | `after-mobile-375-today.png` (96K) | `before-desktop-today.png` (19K) | `after-desktop-today.png` (48K) |
| /library | `before-mobile-375-library.png` (8.1M) | `after-mobile-375-library.png` (1.6M) | `before-desktop-library.png` (4.1M) | `after-desktop-library.png` (635K) |
| /history | `before-mobile-375-history.png` (28K) | `after-mobile-375-history.png` (46K) | `before-desktop-history.png` (16K) | `after-desktop-history.png` (25K) |
| /settings | `before-mobile-375-settings.png` (54K) | `after-mobile-375-settings.png` (102K) | `before-desktop-settings.png` (28K) | `after-desktop-settings.png` (49K) |

All after shots: 0 pageErrors, 0 consoleErrors, 0 failed 4xx/5xx (see `walk-report-after.json`).

---

## 7. Verification (Gates)

- `pnpm build` — pass (166 modules, CSS 23.96K)
- `pnpm lint` — pass (oxlint)
- `pnpm test` — 12/12 pass
- `walk` after — 8/8 ok, http 200, URL `http://localhost:3010` status ok

---

## 8. DEGRADED (explicit)

- **DB** — N/A: Zustand persist localStorage only, no server DB to audit.
- **Roles/Auth** — N/A: no auth, no roles.
- **Landing/Marketing** — N/A: SPA only, no marketing page.

Skipped per adapted review-all instructions.

---

## Next (outside this phase)

Weekly planner route + plan model -> guided workout (plan preload, rest timer, wake lock, PR badge, progression suggestions) -> PWA -> final playwright verification. Gates each.

