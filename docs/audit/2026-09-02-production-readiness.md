# Production readiness audit — 2 September 2026

**Scope:** everything. Collection rules, endpoints, the client, the walks, the
build, the deploy, the docs. Read-only: this document is the output, and no
code was changed while writing it.

**⚠️ DEGRADED: single-context.** The `/review-all` skill asks for audit and
critique as parallel sub-agents. This ran in one context. It also asks for
Lighthouse and an axe accessibility sweep; neither is installed and adding a
dependency mid-audit was not the audit's call to make. Both are recommended
below. Everything else here was measured against a running system, not
inferred.

**The skill this ran under was written for another product.** Its Phase 0
(postgres, `/api/status`, port 3010) and Phase 4 (liquid-glass hero,
sticky-stack, image generation) describe BuilderHunt. They were not applied:
transplanting one product's design decisions onto another is exactly the
"aesthetic direction change" the skill forbids. Its discipline was kept — gates,
one commit per phase, a hard stop before writing code, report don't skip.

---

## Verdict

**Ship-shape where it matters most, with one class of gap that would embarrass
us and one that would cost money.**

The collection rules — the layer that decides what any account may fetch — are
sound across all 17 collections, and every rule with a hook carrying the real
check has that hook. Nothing leaks by the API. The code carries almost no debt.
There are no known dependency vulnerabilities and no secrets in the tree.

What is not ready: the web server ships **no security headers and no
cache-control on `index.html`**, the AI coach proxy **meters usage and caps
nothing**, and the two walks that prove **profile isolation and encryption at
rest** have been dead for weeks. The first two are production hardening the
product has simply never had. The third is the audit tooling failing to guard
the product's central promise.

---

## Baseline, measured

| Gate | Result |
| --- | --- |
| `tsc -b` | clean |
| `vitest run` | 496 / 496 |
| `oxlint` | clean |
| `pnpm build` | clean, 81 precache entries, 3.4 MB |
| `pnpm audit` (prod and dev) | no known vulnerabilities |
| Secrets in tracked files | none |
| `TODO` / `FIXME` / `HACK` | 0 |
| `as any` | 1 |
| `@ts-ignore` / `@ts-expect-error` | 0 |
| `eslint-disable` | 2 |
| `console.log` in `src/` | 0 |
| Audit the rules (CI, Linux, first run) | 5 / 5 in 34 s |
| Audit the screens (CI, first run) | **10 / 12** — see F-08 |
| Audit the screens (local, built app) | 12 / 12 in 551 s |

Production, as served on 2 Sept: 8 accounts, 2 gyms, 1 message, 7 encrypted
records, 2 push subscriptions, 0 applications, **0 coach usage rows**.

---

## Findings

Severity: **P0** would embarrass us or lose data today · **P1** will cost money
or a customer · **P2** should be fixed before the next paying gym · **P3** debt.

Each is marked **mechanical** (a fix with one right answer) or **decision**
(somebody has to choose).

### P0

**F-01 · The isolation and encryption walks are dead.** *mechanical*
`scripts/audit/test-gate.mjs` and `scripts/audit/test-profiles.mjs` test that
two profiles on one device cannot see each other, that a wrong passphrase opens
nothing, and that data at rest is ciphertext. Both fail at their first step —
the same double sign-in panel that broke five other walks — and neither is in
any group `run.mjs` knows about. The product's central promise has had no
automated check for weeks. **Fix:** port both to the shared `door()` and add
them to `screens`. Then promote `Audit the rules` to a required check.

### P1

**F-02 · The web server sends no security headers.** *mechanical*
Measured against production: no `X-Content-Type-Options`, no
`X-Frame-Options` / `frame-ancestors`, no `Referrer-Policy`, no
`Permissions-Policy`, no `Content-Security-Policy`, no HSTS, and
`server: nginx/1.29.8` disclosed. `deploy/nginx.conf.template` sets none.
This is an app that holds encrypted training data behind a passphrase; it
should not be framable by an arbitrary site. **Fix:** headers in the template,
`server_tokens off`. CSP is the one that needs care — the app loads exercise
images from a first-party proxy and nothing else third-party, which makes a
strict policy feasible, but it has to be verified against every route by the
walks, not written and hoped.

**F-03 · `index.html` has no `Cache-Control`.** *mechanical*
The template sets `no-cache` on `sw.js` and `immutable` on `/assets/`, and
nothing on the document itself; production returns only an `ETag`. A browser
that heuristically caches `index.html` will request hashed asset names that no
longer exist after a deploy and get 404s until the service worker catches up —
the classic broken-PWA-after-release. **Fix:** `location = /index.html { add_header
Cache-Control "no-cache"; }` and the same for `/`.

**F-04 · The AI coach proxy has no cap.** *decision*
`/api/minimax/chat/completions` is guarded (signed-in only) and writes a
`coach_usage` row per call — tokens, latency, outcome — and then does nothing
with it. Any account can call it as often as it likes and every call is billed
to us. Production shows 0 usage rows, so nobody has yet, which is the moment to
decide the limit rather than the moment after. **Decide:** calls per account
per day (the intake makes one call per programme; five a day is generous), and
whether to refuse in words or degrade to the deterministic generator silently.
The meter already exists; the cap is a query and a sentence.

**F-05 · The deploy token travels over plain HTTP.** *decision*
`COOLIFY_API_URL` is `http://178.105.106.79:8000`, so on every push to `main`
the bearer token that can deploy any app on that server leaves GitHub's
runners unencrypted. The workflow's own header comment names this caveat.
**Decide:** put Coolify behind TLS (it supports it) or accept the exposure in
writing. This is infrastructure, not this repo, but this repo is what exercises
it.

### P2

**F-06 · `saas-review-walk.mjs` has the same dead door.** *mechanical*
The multi-viewport, three-role walker — the one the skill's Phase 1 is built
around — reports four `GAP`s, all fixture failures at the sign-in panel
(`#f-name`, `Create profile` strict violation, a `lock` button). It has not
produced a real screenshot sweep since the landing changed. **Fix:** port to
`door()`; then it becomes the a11y/overflow/console sweep this audit could not
run.

**F-07 · `record-store.ts` has no unit spec.** *mechanical*
292 lines of PBKDF2 and AES-GCM — the thing the privacy promise rests on — and
the only test that touches it is `sync.spec.ts`, indirectly. `test-profiles`
covered "ciphertext at rest" from the outside and is dead (F-01). **Fix:** a
spec that encrypts, tamper-flips a byte, and asserts decryption fails; asserts a
wrong passphrase yields nothing; asserts the iteration count. Cheap, and it is
the one test a security reviewer will ask for first.

**F-08 · `Audit the screens` fails in CI on a harness assumption.** *mechanical*
`vite preview` proxies `/pb` to a local PocketBase on 8090. One was running on
the machine where the group was verified, so the app's sync probes answered 200;
in CI nothing listens there, the proxy returns 502, and `test-session` and
`test-onboarding` — the only two walks that collect console errors — fail on
three `502 Bad Gateway` lines. **Fix:** boot a sandbox for the screens job and
point the preview at it, so CI and a laptop see the same thing. The product is
fine; the walks were checked against a machine that was quietly more complete
than CI.

**F-09 · Three walks are in no group.** *mechanical*
`test-gate`, `test-profiles` (F-01) and `walk.mjs`. The last one is alive and
passes — a route screenshot sweep at two viewports — and writes to
`docs/impeccable/`, which then shows up as an untracked mess in `git status`.
**Fix:** add all three to `run.mjs`; have `walk.mjs` write under `.audit-shots/`
like the others.

**F-10 · The web image has no `HEALTHCHECK`.** *mechanical*
`deploy/pocketbase/docker-compose.yml` health-checks PocketBase every 30 s; the
push service and the web image have none. Coolify polls externally, so this
mostly matters for `docker compose` locally and for `depends_on` ordering.

### P3

**F-11 · `.env.example` is stale.** *mechanical*
Documents `SPOONACULAR_API_KEY`, which nothing reads; the code reads
`FATSECRET_*`. Documents `PB_SU_*` where the compose and hooks say
`PB_SUPERUSER_*`. The server side (`deploy/pocketbase/README.md`, compose) is
correct and complete — it is the root example that drifted.

**F-12 · A 601 KB (gzip) chunk.** *decision*
`exercise-details` is 2.2 MB raw, 601 KB compressed, and is correctly **not**
precached — it loads on demand when a movement is opened. `exercise-data`
(243 KB gzip) is precached and is what every install downloads. This is the
cost of 2,076 movements working offline and it is a fair trade; it is listed so
nobody discovers it as a surprise. If it ever matters, the split is by muscle
group at the manifest, not by hand.

**F-13 · Outdated dependencies.** *mechanical*
All patch-level except `typescript` 6 → 7 and `@types/node` 24 → 26, both
majors. Nothing is vulnerable. Leave the majors for a deliberate upgrade.

**F-14 · Rules that look open, carried by hooks.** *note, not a defect*
`gym_menus` `create`/`update` and `gym_messages` `create` are permissive as
rules and correct as behaviour because a hook does the check. Verified. Worth
knowing because it means a missing or broken hook file opens a collection with
no rule to catch it — and the rules walks test menus from the UI, not from a
rival's account. A `menus-boundary.mjs` in the pattern of the other five would
close that.

---

## What was verified and found sound

Stated so nobody re-audits it next month.

- **All 17 collections' effective rules**, read from a real PocketBase after
  every migration, not from the migration files. `gym_secrets` and
  `shared_cache` superuser-only; `users` self-only with the `gym` field guarded
  by a hook against direct writes; `records`, `sync_state`, `push_subs`
  owner-only; every gym collection keyed on `gym.operators`; the house and
  open-door arms of `gym_messages` exactly as the boundary walks assert.
- **All 15 endpoints.** Fourteen check `e.auth`, `isOwner`, operator membership
  or `hasSuperuserAuth()`; the public four (`capabilities`, `daily-dish`,
  `recipes`, `recipe/{id}`) are read-only catalogue data by design.
- **The client reads no secrets.** Three build-time defines
  (`__AI_COACH__`, `__AI_COACH_HOST__`, `__AI_COACH_MODEL__`); no
  `import.meta.env` anywhere.
- **Docs are current.** No "two plans", no €500, no stale Coming counts in
  `docs/*.md`.
- **The five rules walks, in CI, on Linux, first try.**

---

## What this audit could not do

- **Accessibility sweep.** No axe. The aurora-contrast probe covers one surface
  class. Recommend `@axe-core/playwright` as a dev dependency and a walk that
  runs it across the route inventory.
- **Performance.** No Lighthouse. Bundle sizes were measured by hand instead.
- **Parallel critique.** Single context, per the banner at the top.

---

## Proposed remediation order

Each a phase, each a commit, gates between.

1. **F-01, F-06, F-09** — revive the dead walks, add them to `screens`. One
   afternoon; restores the check on the central promise.
2. **F-08** — sandbox for the screens job. Makes CI truthful about the walks.
3. **F-02, F-03, F-10** — nginx headers, `index.html` cache, healthcheck.
   Verified by curl against the preview *and* by the walks under a CSP.
4. **F-07** — the record-store spec.
5. **F-04** — the coach cap, once the number is chosen.
6. **F-11, F-13** — tidy.

F-05 and F-12 are decisions to record, not code to write.

**This is the hard stop.** Nothing below this line is built until you say which
of the above to build.
