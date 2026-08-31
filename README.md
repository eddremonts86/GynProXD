# enForma

Local-first hybrid gym and calisthenics tracker. Vite 8 + React 19 + TypeScript +
Tailwind v4 + TanStack Router/Query + Zustand + Base UI primitives + PWA. No
cloud, no server: data lives in this browser under local profiles, each one
encrypted with its own passphrase (PBKDF2 + AES-GCM via WebCrypto), and is
exportable as JSON at any time.

Profiles make the device shareable: several people can train on one browser and
nobody can read anyone else's data without their passphrase. There is no
recovery for a forgotten passphrase; the JSON export is the backup.

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
| `node scripts/import-wger.mjs` | rebuild the separate CC-BY-SA wger library (never merged into the catalogue) |
| `node scripts/import-exercises.mjs` | rebuild the movement catalogue, translations and video map (`--no-media` skips the illustrations, `--no-video-check` skips re-verifying videos, `--youtube` proposes new ones with `YOUTUBE_API_KEY`) |
| `node scripts/build-image-map.mjs` | rebuild the movement image map from the RepDB files on disk |
| `node scripts/generate-icons.mjs` | regenerate the favicon and PWA icons from the brand mark |

## AI coach (optional)

Plan generation can be designed by an LLM (MiniMax). Copy `.env.example` to
`.env.local` and set `MINIMAX_API_KEY`; the dev server proxies the API and
injects the key server-side, so it never reaches the browser bundle or this
repository. The coach designs the split, movement selection, progression and
supersets; timelines and safe rates stay computed locally and every movement id
is validated against the catalogue. No key, a timeout or an invalid response
all fall back to the built-in deterministic generator.

## Features

- **Plan builder.** Describe your situation in free text ("40 years old, 140kg,
  want to get down to 80kg, gym 3 times a week for 2 hours") in English or
  Spanish. enForma works out a safe rate (0.4 to 1.0 kg/week for fat loss) and a
  realistic timeline, refuses to pretend a goal fits in less time than it takes,
  and generates a periodised 1/3/6/12 month calendar with deload weeks and
  movement rotation per 4-week block. With a target weight set, the maths run
  regardless of the stated goal; without one, enForma says there is no clock
  instead of inventing a timeline.
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
- **Gym & admin panels.** Profiles carry a role: gym operators see their
  members and publish templated messages (announcements, events with RSVP,
  daily menus, QR-coded offers); an admin profile manages users, roles and
  the gym catalogue. Delivery is local-first — in-app inbox with unread
  badges plus opt-in system notifications (see docs/PANELS.md for the
  push-server seam).
- **Local profiles.** Per-person encrypted stores on one device, with a lock
  screen, passphrase-gated unlock and one-time migration of pre-profile data.

## Exercise imagery & data licensing

Clean-room rebuild: zero code or assets from openGym (AGPL). All movement
imagery is freely licensed:

- **free-exercise-db** covers 876 of the 1,322 movements: names, muscles,
  instructions and two photographs each (start and end of the rep), from
  [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)
  (Unlicense). Photos load from jsDelivr and are runtime-cached, so anything you
  have looked at stays available offline. They are not bundled: at roughly 60 KB
  each that would add about 50 MB to the app.
- **RepDB free tier** contributes the other 446 movements — the banded work,
  the stretching and mobility library and most of the calisthenics skills — plus
  1,056 flat 512px WebP illustrations in `public/repdb/`, which double as the
  offline fallback when the photo CDN cannot be reached. It also supplies
  `src/data/exercise-details-generated.json`: Spanish text, coaching tips, MET
  values and difficulty for 601 movements, loaded as its own chunk rather than
  bundled. Used with the visible credit "Exercise data by RepDB (repdb.co)"
  required by its [free-tier licence](https://repdb.co).
- Anything with neither gets a typographic muscle tile rendered in CSS. Nothing
  is fabricated to look like an illustration that does not exist.
- **exercises-dataset** (hasaneyldrm, MIT) adds no movement and no picture —
  only step-by-step instructions in ten languages for 253 movements already in
  the catalogue. Its GIFs are © Gym visual and are deliberately not used.
- **Demonstration videos** are links, not files: 26 movements carry a YouTube
  id seeded from exercemus and wger. They play in YouTube's embedded player
  behind a facade, so nothing is requested from Google until somebody presses
  play, and only the video id is stored — YouTube's policy caps storage of
  titles and thumbnails at 30 days.

- **wger** (CC-BY-SA 4.0/3.0 and CC0) adds 754 movements in files of their own,
  with per-row credit rendered beside the description. They are browsable and
  can be put in the planner, but the plan generator does not draw on them:
  share-alike attribution has to be legible wherever the text appears, and a
  generated programme scatters names across a dozen screens.

No GIFs from scraped or unlicensed sources are bundled or hotlinked.

## Docs

Product spec and legal posture: [docs/SPEC.md](docs/SPEC.md) ·
Design system: [DESIGN.md](DESIGN.md) · Product truth: [PRODUCT.md](PRODUCT.md)
