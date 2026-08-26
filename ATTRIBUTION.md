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

## Fonts

- **Geist / Geist Mono** — Vercel, OFL 1.1.
- **Doto** — Google Fonts, OFL 1.1.
