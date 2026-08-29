# Third-party assets and data

enForma redistributes the following third-party material. This file is the
repo-level record; the app's Settings → About section carries the same
attribution for end users.

## free-exercise-db (public domain)

- **What**: exercise names, muscle groups, instructions and photograph
  references used to build `src/data/exercises-generated.ts`.
- **Source**: <https://github.com/yuhonas/free-exercise-db>
- **License**: Unlicense (public domain). No conditions.
- Photographs are hot-loaded from the project's CDN URLs at runtime; they
  are not stored in this repository.

## RepDB free exercise dataset (free tier, attribution required)

- **What**: 384 flat-style 512px WebP exercise illustrations stored in
  `public/repdb/`, used as the offline fallback when the photo CDN is
  unreachable.
- **Source**: <https://repdb.co/free-exercise-dataset>
- **License**: RepDB free tier, which requires attribution. Attribution is
  given here and in the app's About section.
- **Open question (tracked)**: whether the free tier permits redistributing
  the files themselves in a public repository, as opposed to using them in
  a deployed app. If RepDB's terms turn out to disallow it, the remedy is
  to remove `public/repdb/` from the repo and fetch the set at build time.

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
