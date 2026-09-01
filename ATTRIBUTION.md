# Third-party assets and data

enForma redistributes the following third-party material. This file is the
repo-level record; the app's Settings → About section carries the same
attribution for end users.

## free-exercise-db (public domain)

- **What**: 876 of the movements in `src/data/exercises-generated.ts` — names,
  muscle groups, category, instructions and photograph references.
- **Source**: <https://github.com/yuhonas/free-exercise-db>
- **License**: Unlicense (public domain). No conditions.
- Photographs are hot-loaded from the project's CDN URLs at runtime; they
  are not stored in this repository.
- Its ids are the catalogue's primary keys and are written into every logged
  workout, so they are frozen: `scripts/import-exercises.mjs` may add to them
  but never renames one.

## RepDB free exercise dataset (free tier, attribution required)

- **What**: the other 446 movements in the catalogue, the flat-style 512px
  WebP illustrations in `public/repdb/`, and the whole of
  `src/data/exercise-details-generated.json` — Spanish names, descriptions,
  instructions and tips for 601 movements, plus MET values, difficulty and
  mechanics. The illustrations also serve as the offline fallback when the
  photo CDN is unreachable.
- **Source**: <https://repdb.co> · dataset at
  <https://github.com/RepDB/exercise-dataset>
- **License**: RepDB free tier, which requires attribution. The required
  credit — "Exercise data by RepDB (repdb.co)" — is given here, in the app's
  About section and in the landing footer.
- **Open question (tracked)**: term 3 of the current licence reads "no
  redistribution as a dataset — don't republish, resell, or repackage it (or a
  derivative) as a dataset, dataset repo, or API. In-app use only." A public
  repository holding the raw WebP files sits close enough to that line to be
  worth resolving. The remedy is unchanged and now cheap: drop `public/repdb/`
  from version control and let `node scripts/import-exercises.mjs` fetch the
  files at build time, which it already does for anything missing.

## exercises-dataset — instructions in ten languages (MIT, text only)

- **What**: step-by-step instructions in English, Spanish, French, Italian,
  Polish, Turkish, Russian, Chinese, Hindi and Korean for 253 movements the
  catalogue already had, in `src/data/exercise-details-generated.json`.
- **Source**: <https://github.com/hasaneyldrm/exercises-dataset>
- **License**: MIT — but only for part of the repository. Its LICENSE carves
  out `images/` and `videos/`, which are © Gym visual and which "cloning this
  repository does not grant you any license to". **None of that media is used
  here, and none of it may be**: the import takes text and nothing else, adds
  no movement, and downloads no file. If that ever changes, it needs a licence
  bought from Gym visual first.

## wger (CC-BY-SA / CC0, kept in its own files)

- **What**: 754 further movements, browsable and usable in the planner, with
  descriptions in English and — for 561 of them — Spanish, and 226 images
  hot-linked from wger's own servers. They live in
  `src/data/exercises-wger-generated.ts` and `src/data/exercise-wger-text.json`.
- **Source**: <https://wger.de> · API at <https://wger.de/api/v2/>
- **License**: per movement, as wger states it — 622 CC-BY-SA 4.0, 117
  CC-BY-SA 3.0, 15 CC0. Every row carries its own `licenseAuthor`, `license`
  and `licenseUrl`, and the app renders that credit under the description it
  belongs to.
- **Why they are not in `exercises-generated.ts`.** CC-BY-SA is share-alike:
  an adaptation inherits the licence. Merging these rows into the catalogue
  would make one derived database of all of it, putting our own curation out
  under CC-BY-SA — and, fatally, obliging us to permit a redistribution we have
  no right to permit for RepDB's rows, whose licence forbids exactly that. The
  two licences cannot share a file, so they do not.
- They are also kept out of the generated programmes (`lib/plan-generator.ts`
  draws from the catalogue alone). A programme prints movement names across a
  dozen screens; keeping share-alike content to the surfaces a person navigates
  to on purpose keeps the credit somewhere it can actually be read.
- Nothing of theirs is copied into this repository: the descriptions are text
  we fetched and flattened, and the images are links to wger's servers.

## YouTube demonstration videos (embedded player)

- **What**: 26 movements link to a demonstration video, seeded from the lists
  curated by [exercemus](https://github.com/exercemus/exercises) and
  [wger](https://wger.de) and kept in `src/data/exercise-videos.json`.
- **License**: the videos belong to their channels and are not redistributed —
  they play through YouTube's own embedded player, which carries its branding
  and its own terms.
- **Two rules the implementation follows.** Only the eleven-character video id
  is stored: YouTube's developer policy caps storage of unauthorised metadata
  (titles, channel names, thumbnails) at 30 days, and a committed file is
  forever, so titles are read at import time to verify the video and then
  discarded. And nothing loads from Google until the viewer presses play —
  `src/components/movement-video.tsx` is a facade over the app's own
  illustration, which keeps a signed-out reader's visit to a movement page
  entirely first-party.

## USDA MyPlate Kitchen recipes (public domain)

- **What**: the recipe catalogue behind the dish of the day and the meal
  suggestions — names, photos, ingredients, preparation steps and per-serving
  nutrition — imported once into the sync server's `recipes` collection and
  served from our own host thereafter.
- **Source**: myplate.gov, retrieved through the Internet Archive (the site
  was retired on 2026-01-07). Import scripts live in `scripts/import/`.
- **License**: works of the US federal government, public domain under
  17 USC §105. No conditions; the credit in the app is a courtesy.

## fatsecret Platform API (free Basic tier, attribution required)

- **What**: live recipe search results (photos, directions, per-serving
  nutrition) used to top up the catalogue when the local rows cannot answer.
- **Source**: <https://platform.fatsecret.com>
- **License**: fatsecret Platform API Terms of Use. Their terms make only
  identifiers storable indefinitely, so fetched content is cached for at most
  24 hours: `recipes.fetchedAt` gates what may be served and the nightly
  `recipesRefresh` job re-requests the rows still in use and deletes the rest.
  Attribution ("Powered by fatsecret", linked) is rendered wherever their
  content displays, and per their terms that credit is retained even if the
  app stops using the API. Credentials are gitignored in `.env.local` and
  live only in the sync server's environment.

## TheMealDB (free API, attribution given)

- **What**: photographs for the three bundled sample dishes in
  `src/data/sample-recipes.ts`, the offline and signed-out fallback. Their
  photos stay on TheMealDB's CDN; nothing is stored in this repository. The
  live dish of the day no longer uses TheMealDB.
- **Source**: <https://www.themealdb.com>
- **License**: free at point of access; the docs ask app-store releases to
  become a supporter. enForma ships as a web app only, so the clause does
  not currently apply; revisit if that changes. Attribution is given here,
  in the app's About section and under the cards themselves.

## Fonts

- **Geist / Geist Mono** — Vercel, OFL 1.1.
- **Doto** — Google Fonts, OFL 1.1.
