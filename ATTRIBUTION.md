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
