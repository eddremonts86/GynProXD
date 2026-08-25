# Forma

Local-first hybrid gym and calisthenics tracker. Vite 8 + React 19 + TypeScript +
Tailwind v4 + TanStack Router/Query + Zustand (persist, localStorage) + Base UI
primitives + PWA. No account, no server: your data lives in your browser and is
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
| `node scripts/import-free-exercise-db.mjs` | regenerate exercise metadata from free-exercise-db |
| `node scripts/build-image-map.mjs` | rebuild the movement image map from the RepDB files on disk |
| `node scripts/generate-icons.mjs` | regenerate the favicon and PWA icons from the brand mark |

## Features

- **Plan builder.** Describe your situation in free text ("40 years old, 140kg,
  want to get down to 80kg, gym 3 times a week for 2 hours") in English or
  Spanish. Forma works out a safe rate (0.4 to 1.0 kg/week for fat loss) and a
  realistic timeline, refuses to pretend a goal fits in less time than it takes,
  and generates a periodised 1/3/6/12 month calendar with deload weeks.
- **Guided session.** The day's plan preloads, each movement's fields are
  prefilled from the progression engine, a 90s rest timer runs with +30s and
  skip, the screen stays awake, and personal records are detected via an Epley
  1RM estimate.
- **Supersets, timed sets and per-side sets**, configured per movement in the
  planner. Rest only starts once a superset group is finished.
- **History.** Estimated 1RM over time, bodyweight trend, and where the last four
  weeks of volume actually went.
- **Offline.** Installable PWA. The app shell is precached; movement artwork is
  cached as you use it.

## Exercise imagery & data licensing

Clean-room rebuild: zero code or assets from openGym (AGPL). All movement
imagery is freely licensed:

- **free-exercise-db** is the primary source: names, muscles, instructions and
  two photographs per movement (start and end of the rep), from
  [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (Unlicense). All 873 movements are covered, which is why the catalogue reads
  as one consistent set of real photography. Photos load from jsDelivr and are
  runtime-cached, so anything you have looked at stays available offline. They
  are not bundled: at roughly 60 KB each that would add about 50 MB to the app.
- **RepDB free tier** is the offline fallback: 384 flat 512px WebP illustrations
  in `public/repdb/`, shown when the photo CDN cannot be reached. Used with
  visible in-app attribution to
  [RepDB](https://repdb.co/free-exercise-dataset) under its free-tier
  attribution licence.
- Anything with neither gets a typographic muscle tile rendered in CSS. Nothing
  is fabricated to look like an illustration that does not exist.

No GIFs from scraped or unlicensed sources are bundled or hotlinked.

## Docs

Product spec and legal posture: [docs/SPEC.md](docs/SPEC.md) ·
Design system: [DESIGN.md](DESIGN.md) · Product truth: [PRODUCT.md](PRODUCT.md)
