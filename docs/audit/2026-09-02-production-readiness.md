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
*Done, later the same day: both walks were added to CI, and `Audit the rules`
is a required check on `main` and `dev` after 25 green runs with no flakes.
`Audit the screens` runs on every pull request and stays optional, because
two of its walks wait on real clocks and a flake there would block a release.*

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

*Left as written on the day. The first two were closed afterwards: the axe
sweep and Lighthouse are both walks now, and the remediation record below says
what each of them found. The third was not — this audit ran in one context and
no second opinion was ever taken on it.*

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

---

## Remediation record — same day

Built on your word: everything marked *mechanical*, nothing marked
*decision*. One commit per phase, gates between, all verified against a
running system.

| Phase | Findings | Commit | Verified by |
| --- | --- | --- | --- |
| 1 | F-01, F-06, F-09 | `966af04` | test-gate 9/9, test-profiles 9/9, walk all pages ok, saas walker 48 shots / 0 gaps |
| 2 | F-08 | `5032078` | sandbox on 8790 + preview on 4174 as CI runs it; test-session and test-onboarding clean |
| 3 | F-02, F-03, F-10 | `c245454`, `f005b77` | the built image on a user-defined network: every header on 7 response kinds, container healthy, 8 walks clean under the CSP |
| 4 | F-07 | `798e648` | 10 cases, 506/506 overall |
| 5 | F-11, F-13 | `20973e8` | tsc, tests, lint, build |

Three things the work itself turned up, none in the original list:

- **The unlock list matched by prefix.** `gate.mjs`'s `unlock('Sol')` took
  "Sol Desk" as readily as Sol; only the walk order had hidden it. Fixed with
  an exact match on the name span (`card()`), which every walk now uses.
- **A fresh server's `daily-dish` is a 503 by design**, and Chrome prints the
  failed load no matter how quietly the client falls back. `watchConsole()`
  ignores exactly that URL and nothing else; the alternative was a
  multi-hour recipe crawl in CI.
- **A strict umask makes the image serve 403s.** `COPY` keeps the checkout's
  file modes; 0600 illustrations under `/repdb` were unreadable to nginx's
  worker. Production only escaped because its clone was 0644. The build stage
  now normalises modes.

One correction to the record: commit `c245454`'s message lists
`test-banner-menu` as clean under the CSP. It was not — the policy refused
the http loopback server every account-bearing walk uses — and `f005b77`
fixes both the policy and the claim.

### What was still open at that point — all of it closed later the same day

Left here as it was written, because the section below is the answer to it and
a record that skips the question reads like nobody asked.

- **F-04** the coach cap → **built**: 20 calls per account per rolling 24 hours.
- **F-05** the Coolify token over plain HTTP → **fixed**: the instance has its
  own hostname and certificate, and the secret is `https://`.
- **F-12** the 601 KB exercise chunk → **accepted**, unchanged.
- **F-14** a `menus-boundary` walk → **built**, and in the rules group.
- The axe sweep → **built**, as `a11y-sweep.mjs` in the screens group. It runs
  over the whole route inventory at two viewports and found one serious
  violation on thirty-one screens: an unnamed text field at the gym desk.
- Lighthouse → **built**, as `lighthouse-sweep.mjs` in the screens group, over
  the two doors a stranger can reach. It found what hand-measuring bundle sizes
  could not: the landing page was 4.8s to Largest Contentful Paint on a
  throttled phone, because the entry chunk pulled in the 243 KB movement
  catalogue. See below.

---

## The decisions, taken — same day

You handed these back to me to decide. Here is what was decided and why, and
what was built for each.

### F-04 · The coach cap — **built**

**Twenty calls per account per rolling 24 hours.** Counted over the
`coach_usage` rows the proxy already wrote, so no new table. Over the limit is
a 429; both callers already fall back to the deterministic generator on any
non-2xx, so a member over the limit still gets a programme and never sees an
error.

Twenty because the intake spends one call per programme and the kitchen one per
suggestion: that is a working day of both, and still two orders of magnitude
short of a bill worth noticing. The check runs *before* the vendor-key check —
"over the limit" is true whether or not this server has a coach, and asking
first is what makes the boundary provable on a sandbox that has no key and
spends nothing. Proved by `scripts/audit/coach-cap.mjs`, in the rules group.

### F-05 · The deploy token over plain HTTP — **fixed**

`COOLIFY_API_URL` was `http://178.105.106.79:8000`, so on every push to `main`
the bearer token that can deploy any app on that server left GitHub's runners
unencrypted. It was accepted in writing earlier today on the grounds that the
instance answered nothing on TLS and had no hostname of its own. Both halves of
that turned out to be one setting away from false:

- `coolify.eduardoinerarte.dk` already resolved to the server, and Traefik was
  already terminating TLS there for the hosted apps — the instance simply had
  no router of its own, so that name 404'd over http and had no certificate.
- Coolify's own **URL** setting (Settings → Configuration → General) is what
  creates that router. Set to `https://coolify.eduardoinerarte.dk`, Traefik
  issued a Let's Encrypt certificate (`CN=coolify.eduardoinerarte.dk`, valid to
  1 December 2026) within seconds.

The `COOLIFY_API_URL` secret and the fleet's local copy now both point at
`https://coolify.eduardoinerarte.dk`. Verified: the authenticated API answers
200 over TLS with a verified chain, and a full `Deploy` run — dispatched by
hand with the sync server included — deployed both applications green through
the new URL. The plain `http://…:8000` endpoint still answers, so nothing that
has not been switched over is stranded.

**The token was narrowed too.** `COOLIFY_API_TOKEN` was a *root* token, so a
leak owned the server rather than merely deploying to it. It is now a token
scoped to **`deploy` + `read`**, and the difference is measurable rather than
claimed:

| Request | root | deploy + read |
| --- | --- | --- |
| trigger a deploy, poll it | yes | yes |
| `applications/{uuid}/envs` | **real values** — this is where the PocketBase superuser password was read from earlier today | 200, every value **empty** |
| `security/keys` | full records | metadata only, no private key material |
| `DELETE applications/{uuid}` | yes | **403** |

`read:sensitive` is the permission that returns values, and it is deliberately
not granted. Verified by a full `Deploy` run with the sync server included,
green on the new token.

It does not expire, on purpose: an unattended CI credential that dies quietly
is an outage nobody has scheduled, and the scope is now small enough that
longevity is the lesser risk. Worth knowing: the **root** token still in the
fleet's local `.env` **expires on 28 September 2026**, and nothing warns about
that either.

### F-12 · The 601 KB exercise chunk — **accepted, unchanged**

`exercise-details` is loaded on demand and is correctly not precached; what
every install downloads is `exercise-data` at 243 KB gzipped. That is the price
of 2,076 movements working offline and it is a fair one. No code, no budget
check, no split. If it ever stops being fair the split is by muscle group at the
manifest, and it will be obvious when that day arrives.

### F-14 · The menus boundary — **built**

`scripts/audit/menus-boundary.mjs`, in the pattern of the other five. It asks
from a rival operator's account, not from the UI: write a card into my gym,
reprice mine, delete mine, read what my members are charged, read it with no
gym at all, read it signed out. All refused; the member reads and cannot write.

This closes the gap the finding named — `gym_menus` create and update are
permissive as rules and correct only because a hook follows the relation, and
nothing tested what happens if that hook stops loading.

---

### Lighthouse — **built**, and it found something

Run over `/` and `/for-gyms` at two form factors, because everything else is
behind a lock screen and Lighthouse's cold-load-on-a-slow-phone model says
nothing true about a screen you reach on your fourth visit from a warm service
worker.

The first run, before anything was changed:

|              |            | perf | a11y | best | seo | LCP  |
| ------------ | ---------- | ---- | ---- | ---- | --- | ---- |
| `/`          | mobile     |   71 |  100 |  100 |  92 | 4.8s |
| `/`          | desktop    |   98 |  100 |  100 |  92 | 0.9s |
| `/for-gyms`  | mobile     |   73 |  100 |  100 |  91 | 4.5s |
| `/for-gyms`  | desktop    |   98 |  100 |  100 |  91 | 0.9s |

Accessibility at 100 across the board is the axe sweep's work showing up in a
second tool. The mobile column is the finding: **4.8 seconds to first paint on
the marketing page**, against the 2.5s the audit itself set as the target.

Total mainthread work was 0.5s and blocking time was 0ms, so this was not
JavaScript being slow — it was 646 KB of it having to arrive first. Of that,
**243 KB was the movement catalogue, on a page that never names a movement.**

It arrived through one import. `store/useGym.ts` pulled in the catalogue to
seed the id → movement lookup at module scope, `components/app-shell.tsx`
imports the store, and the shell is the entry. A signed-out visitor reading the
landing was downloading 2,076 exercises to render a headline.

Two of the four seeding calls in the store were the same line written twice at
module scope, and were the only two that ran for a signed-out visitor; the
other two run on hydration, after a profile is unlocked. So the fix is a split,
not a rewrite: `lib/exercise-cache.ts` now owns the Map and imports nothing,
`lib/exercises.ts` owns the catalogue and seeds that cache when it loads, and
the store imports the cache alone. Every surface that renders a movement name
imports `lib/exercises`, so the cache is still seeded synchronously before any
of them first render — the invariant holds by construction rather than by two
module-scope calls remembering to run.

The catalogue is still precached by the service worker, which is what makes it
work offline and is the whole point of F-12. What changed is that it is no
longer a render-blocking `modulepreload` in `index.html`: it now loads with the
route chunks that need it, and in the background for offline use.

Two smaller things the same run found:

- **No `robots.txt`.** Written, allowing the two public doors and disallowing
  the rest, which renders an empty shell to anything that follows it.
- **WCAG 2.5.3, Label in Name.** The landing's mobile header carried a link
  reading "For members" whose accessible name was "I want to train" — speech
  input says what it sees, and this link answered to nothing a person could
  read on it. The `aria-label` was there to give the mobile link its desktop
  wording; it was removed, and the visible text is the name. The axe sweep did
  not catch this because the rule lives in axe's `experimental` set, outside
  the WCAG tags that sweep runs.

After all three:

|              |            | perf | a11y | best | seo | LCP  |
| ------------ | ---------- | ---- | ---- | ---- | --- | ---- |
| `/`          | mobile     |   84 |  100 |  100 | 100 | 3.5s |
| `/`          | desktop    |  100 |  100 |  100 | 100 | 0.7s |
| `/for-gyms`  | mobile     |   87 |  100 |  100 | 100 | 3.2s |
| `/for-gyms`  | desktop    |  100 |  100 |  100 | 100 | 0.6s |

**Mobile LCP is still 3.5s, above the 2.5s target.** What remains is the shape
of the thing: a client-rendered SPA cannot paint a headline before its entry
bundle has arrived and run, and the remaining 400 KB is React, the router, the
design system and the shell. Getting under 2.5s means pre-rendering the two
marketing routes to static HTML, which is a real change to how the app is
built and is not something to slip into an audit remediation. It is written
down here rather than left as a number nobody looks at.

The walk's floors are set from these measurements with a few points of slack,
not from ambition: 78 mobile and 92 desktop for performance, 100 for the other
three categories, and an LCP ceiling of 4.0s mobile and 1.5s desktop. A
threshold invented before the measurement is an opinion, and an opinion in a
required check gets switched off the first week it disagrees with somebody.

---

## The deploy incident of 2 September, and what caused it

Four consecutive sync deploys failed after the release, with two different
messages from Coolify (`Failed to read Git source`, then `Failed to read the
Docker Compose file from the repository`). Both come from the same method, and
both are wrappers around a shell command run **on the host**: Coolify pre-reads
the compose file with an anonymous `git ls-remote` plus a sparse checkout before
the containerised clone ever starts.

Measured from the host itself: **seven of eight anonymous `git ls-remote` calls
to this public repository were answered with a credentials prompt** — GitHub
throttling unauthenticated git per IP, on a box that deploys many repositories.
The in-container clone succeeded every time; only the host-side pre-read failed.

`depends_on` in mapping form was a wrong first hypothesis, committed as
`2481f7c`-and-superseded reasoning in #56. The list form is still the right
shape to keep — Coolify's parser is not the only reader of that file — but it
was not the cause. A plain re-trigger with no code change deployed cleanly.

**Fixed at the source, the same afternoon.** Coolify offers no deploy-key
selector for an application created from a public repository — the first
attempt at this assumed it did, and the `Git Source` tab says only
"Currently connected source: Public GitHub" with no key to choose. The
supported route is a **GitHub App source**, which did not exist on this
instance:

- `coolify-eddremonts86` created as a GitHub App and installed on
  **`eddremonts86/enForma` only**, not all repositories: that box's API speaks
  plain HTTP and its database holds the App's private key, so the narrower the
  grant the better (see F-05).
- Both applications switched to it. Every clone and every compose pre-read is
  now authenticated, so there is no anonymous request left to throttle.
- Proved by **three consecutive sync deploys**, on the exact path that had
  failed four times in a row. The brief 503 after the third was the container
  coming up; healthy 30 seconds later.
- The read-only deploy key staged during the wrong hypothesis was removed from
  both the repository and Coolify, so no unused credential is left behind.

**One thing the new source brought with it, and one decision about it.** A
GitHub App delivers push webhooks, which the old public source never did, and
both applications had **Auto Deploy** switched on — so every push to `main`
would have deployed twice, once by webhook and once by this repository's
workflow, and the sync server would have restarted on pushes that changed
nothing it runs. Auto Deploy is now **off** on both. The workflow stays the
only trigger: it is versioned and reviewable, it waits for the result, and it
deploys the sync server only when `deploy/pocketbase/` actually changed.
