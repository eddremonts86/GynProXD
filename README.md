# Forma

Local-first hybrid gym & calisthenics tracker. Vite 8 + React 19 + TypeScript +
Tailwind v4 + TanStack Router/Query + Zustand (persist, localStorage) +
shadcn/ui + PWA. No account, no server — your data lives in your browser,
exportable as JSON at any time.

## Run

```bash
pnpm install
pnpm dev        # http://localhost:3015 (strictPort)
```

## Scripts

| command | what it does |
|---|---|
| `pnpm dev` | dev server (port 3015) |
| `pnpm build` | type-check + production build + PWA service worker |
| `pnpm lint` | oxlint |
| `pnpm test` | vitest (lib: epley/progression/estimate/generator/parser) |
| `node scripts/import-free-exercise-db.mjs` | regenerate exercise list metadata from free-exercise-db |
| `node scripts/generate-placeholders.mjs` | regenerate flat SVG placeholders for movements without a RepDB image |

## Features

- **Onboarding generativo**: describe tu caso en texto libre ("hombre 40 años,
  140kg → 80kg, 3×2h") y la app estima meses realistas (ritmo seguro
  0.4–1.0 kg/semana) y genera un plan periodizado mensual / trimestral /
  semestral / anual con deloads.
- **Guided workout**: preload del plan del día, rest timer 90s (+30s/skip),
  wake lock, badge de PR (epley 1RM) y sugerencias de progresión
  (lineal/doble).
- **Supersets, series por tiempo (sec) y unilaterales L/R** — configurables por
  ejercicio en el Planner; el descanso solo arranca al cerrar el superset.
- **Progreso**: gráfica e1RM (recharts), tendencia de peso corporal y muscle
  heatmap (volumen últimas 4 semanas).
- **PWA offline**: manifest + Workbox precache; jsDelivr cacheado CacheFirst.

## Exercise imagery & data licensing

Clean-room rebuild: zero code/assets from openGym (AGPL). All movement imagery
is 100% freely licensed:

- **RepDB free tier** — 250 flat 512px WebP illustrations, used with visible
  attribution: exercise data by [RepDB (repdb.co)](https://repdb.co/free-exercise-dataset)
  (free tier, attribution license, in-app use). Files in `public/repdb/`.
- **Generated flat SVG placeholders** (Noir Warm style) for the remaining
  movements — original artwork in `public/generated/`, regenerable via
  `scripts/generate-placeholders.mjs`.
- Metadata (names, muscles, instructions) from
  [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (Unlicense).

No GIFs from scraped/unlicensed sources are bundled or hotlinked.

## Docs

Product spec and legal posture: [docs/SPEC.md](docs/SPEC.md) ·
Design system: [DESIGN.md](DESIGN.md) · Product truth: [PRODUCT.md](PRODUCT.md)
