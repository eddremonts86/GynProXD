> **Superseded (2026-08-28).** This documents the retired "Noir Warm" iteration
> (Instrument Serif, amber on noir). The shipped system is **Soft Signal**: warm
> chalk surfaces, monochrome chrome, colour living only in the aurora hero tiles,
> Doto dot-matrix hero figures, and a single documented radius scale. Its source
> of truth is `src/index.css`. This file is kept as history.

# Forma Design System — Noir Warm Editorial

> **Forma** evolved from GynProXD. Hybrid calisthenics + barbell, local-first, warm human editorial, 3D plate.

## Philosophy

- **Hybrid**: calisthenics and iron, not either/or. Library holds 873 movements, planner is weekly rhythm, not rigid split.
- **Warm editorial**: Instrument Serif for display, Inter for UI, amber on noir warm, stone text, soft plates. Human, not clinical.
- **3D abstract**: hero/plate/orb illustrations — central amber sphere, blurred warm orbs, subtle grain. No stock gym photos.
- **Whoop/Strava data**: warm Whoop — e1RM, PR, progression as warm pills, not neon.

## Tokens — `src/index.css @theme`

```css
--color-surface: #1a1816;      /* noir warm bg */
--color-surface-2: #1f1d1b;
--color-card: #26231f;         /* warm card */
--color-card-hover: #2e2a26;
--color-line: #3a3632;
--color-line-strong: #4a4642;
--color-accent: #d98e3f;       /* amber / clay */
--color-accent-soft: #d98e3f14;
--color-accent-hover: #c07a2e;
--color-muted: #b8afa6;        /* warm stone muted */
--color-ink-soft: #e8e0d8;
--color-ink: #f5ede4;

--radius-sm: 10px; --radius-md: 14px; --radius-lg: 18px; --radius-xl: 22px; --radius-2xl: 28px;
--shadow-card: 0 1px 2px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.35);
--font-display: "Instrument Serif", serif; --font-sans: Inter; --font-mono: JetBrains Mono;
--text-xs … --text-4xl
```

Body: radial gradients `#2a2520` + `#2e2216` on `#1a1816`, fixed.

## Components — `src/ui/`

| Component | Role |
|---|---|
| `Card` | `rounded-lg border-line bg-card shadow-card backdrop-blur` — warm, soft |
| `Button` | primary amber `bg-accent text-accent-contrast`, secondary warm border, ghost muted |
| `Input` | `rounded-md border-line bg-surface text-ink-soft placeholder-muted/70 focus:border-accent` |
| `Badge` | pill `rounded-full border px-2.5 py-1 text-11px uppercase tracking-widest` default/accent/muted |
| `EmptyState` | card + 3D plate orb + display title |
| `PageHeader` | eyebrow `text-accent uppercase tracking-widest`, title `font-display 3xl/4xl`, desc `text-muted` |
| `Illustration` | 3 variants: `hero` (large sphere + blurred orbs), `orb` (small warm), `plate` (amber sphere) |

All use `focus-visible: 2px solid accent`.

## Shell — `src/router.tsx`

- Sticky header `border-b border-line/60 bg-surface/70 backdrop-blur` with wordmark `F` amber gradient + `Forma` Instrument Serif 22px + `local training` 10px uppercase.
- Main `max-w-3xl` centered, `px-4 md:px-6 lg:px-8 pb-28 pt-6`.
- Bottom nav `fixed border-t bg-surface/90 backdrop-blur pb-[env(safe-area-inset-bottom)]` — 5 items Today/Planner/Library/History/Settings, active dot amber.

## Routes

- **Today** `src/routes/Today.tsx:17` — eyebrow `Forma · Today`, hero `Illustration hero h-36`, today plan banner `Card border-accent/20`, bodyweight + ready grid `md:grid-cols-2`, rest timer amber soft, PR `bg-accent`, suggestion `border-accent/20 bg-accent-soft`.
- **Planner** `src/routes/Planner.tsx:1` — eyebrow `Forma · Planner`, hero orb, plans chips amber, 7 days `md:grid-cols-2`, each `Card` with `font-display` day + `Start` ghost, progression select, add search.
- **Library** `src/routes/Library.tsx:1` — `Movements` + `873 public-domain`, orb, search + 11 muscle chips, 50 sliced + Load more, cards with image `h-14 w-14 border-line/40` + `Badge`.
- **History** `src/routes/History.tsx:1` — `Traces` + Whoop warm, orb, workouts `Card` with `font-display` date + `Badge` count + `bg-surface-2` sets, bodyweight `divide-y`.
- **Settings** `src/routes/Settings.tsx:1` — `Local-first` + plate, data `Card` with `gynproxd-v2` mono, Export/Import, about `Forma Noir Warm` terracotta + sage narrative.

## PWA — `vite.config.ts:10`

- `VitePWA` name `Forma`, theme `#1a1816`, icons 192/512/maskable from `public/pwa-*.png` (sips from hero), `workbox` runtime jsDelivr CacheFirst, `devOptions enabled`.

## Verification

- `pnpm build` 169 modules CSS 37.62K ok
- `pnpm lint` warnings only Today setState in effect
- `pnpm test` 12/12
- `walk radical` 10/10 pages ok, 0 errors, screenshots `shots/radical-*.png` 120K–1.8M
