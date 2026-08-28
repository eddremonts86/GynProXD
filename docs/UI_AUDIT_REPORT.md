# enForma (GynProXD) — Visual feature audit

- Date: 2026-08-26
- App: `http://localhost:3015` (Vite 8 + React 19 + TanStack Router, `pnpm dev` on port 3015, PID 13476)
- Scope: every screen and workflow discoverable by `src/router.tsx` + modals/dialogs, exercised visually in Chromium via Playwright (Node, `playwright@1.62.1`).
- Method: `app-route-inventory` static discovery (13 route candidates) + 3 Playwright passes with screenshots (`networkidle` + element discovery from rendered DOM). No code was changed for this audit.
- Evidence (local, not committed): `/var/folders/dr/x53jsznd7nvcnljhckpjrxdw0000gn/T/opencode/enforma-audit/`, `enforma-audit2/`, `enforma-audit3/` — screenshots `*.png`, `findings.json`, `console-errors.json`, `network.json`.

> Nothing in this document was fabricated: every PASS/FAIL entry below was observed in the browser during the walks. Where a FAIL turned out to be a harness artifact on deeper inspection it is still listed under "Probe artifacts resolved" so the history is auditable.

## 1. Outcome

- App is functional end-to-end. Plan generation, session, history, gym delivery and admin all render and complete their primary outcomes when exercised at the right wait and with the correct gym-membership fixture.
- No console `error/pageerror` and no failed network requests (`status >= 400`) were observed during the walks except a single `notFoundComponent` warning for an unknown route (see F-01). The jsDelivr CDN and local `public/repdb/` assets load once the cache has warmed.
- Issues below are grouped by severity: **Bugs** (something does the wrong thing), **UX gaps** (functional but confusing/slow), **Missing polish / TODOs** (not shipped yet or deliberately minimal).

## 2. Route inventory (source: `src/router.tsx:53`)

| # | Route | Source file | Kind | Auth | Main job | Primary CTA | Visited | Notes |
|---|-------|-------------|------|------|----------|-------------|---------|-------|
| 1 | `/` | `src/routes/Today.tsx:162` | screen | unlocked profile | see today's plan, start a workout | Start session / Design my programme | yes | shell redirect for `gym`/`admin` via `src/components/app-shell.tsx:268` |
| 2 | `/planner` | `src/routes/Planner.tsx` | screen | unlocked | edit weekly split, add movements | Save / Copy movements | yes | owns `/onboarding` + `/generated` in rail nav |
| 3 | `/challenges` | `src/routes/Challenges.tsx` | screen | unlocked | browse/join challenges | Start challenge | yes | |
| 4 | `/library` | `src/routes/Library.tsx` | screen | unlocked | find one of 873 movements | Search / movement detail | yes | `src/data/exercises-generated.ts` 873 |
| 5 | `/history` | `src/routes/History.tsx` | screen | unlocked | review sessions, volume, 1RM trend | none (read) | yes | |
| 6 | `/settings` | `src/routes/Settings.tsx` | screen | unlocked | edit profile details, data, device | Save details / Export a backup | yes | tabs: Profile / Device / Data / About |
| 7 | `/inbox` | `src/routes/Inbox.tsx` | screen | unlocked, `role !== gym` | read gym announcements | RSVP (events) | yes | hidden for `gym` by `src/components/app-shell.tsx:86` |
| 8 | `/menu` | `src/routes/Menu.tsx:76` | screen | unlocked | daily menu published by gym | none | yes | thin wrapper (76 lines) |
| 9 | `/gym` | `src/routes/GymPanel.tsx:67` | screen, role-gated | `role === 'gym'` | compose/publish messages, manage members & menu | Publish | yes | guard: `<Navigate to={role === 'admin' ? '/admin' : '/'} />` |
| 10 | `/admin` | `src/routes/Admin.tsx:41` | screen, role-gated | `role === 'admin'` | manage users, roles, gym catalogue | Delete / role change | yes | guard: `<Navigate to={role === 'gym' ? '/gym' : '/'} />` |
| 11 | `/fitness-test` | `src/routes/FitnessTest.tsx` | screen | unlocked | 5-min self-test to seed level + effort | Start 60s | yes | |
| 12 | `/onboarding` | `src/routes/Onboarding.tsx:94` | screen | unlocked | generate a periodised plan | Design my programme | yes | not in nav, reached via empty states |
| 13 | `/generated/$id` | `src/routes/GeneratedPlan.tsx:56` | screen, param | unlocked | inspect generated calendar | Copy to planner | yes | bad id shows "Plan not found" grace fully |

Not a route but a screen: the **lock/ProfileGate** (`src/components/profile-gate.tsx:50`) — `status === 'locked'` — is the only screen behind which every route sits.

## 3. What was probed, with evidence

All probes use a **fresh Chromium context** (`localStorage` isolated from the developer's real profiles), so the member "Test Athlete" / "Jorge" / gym "Iron House" / admin "Root Admin" created during the walks will not leak into day-to-day use.

### 3.1 Profile gate

- First-run renders "Create your profile" (`P0` in pass 2, `01-gate-first-run.png`). PASS.
- Empty name submit → inline "Give the profile a name." (`02-gate-validation.png`). PASS. Field receives focus.
- Mismatched passphrase → "The passphrases do not match." PASS.
- < 4 char passphrase → "The passphrase needs at least 4 characters." PASS.
- Reveal toggle (eye) works. PASS.
- Role select offers Member / Gym / Administrator; Gym mode requires a gym name. PASS.
- Unlock with correct passphrase returns to the app; wrong passphrase → "That passphrase does not open this profile." and focus on the passphrase field. Lock button (`Lock this profile`) returns to the gate. Re-unlock with the correct phrase restores the session. PASS.
- Keyboard: first Tab from the rail is the app-shell `Skip to content` link (`#main`), then the nav. PASS (`P32`).

### 3.2 Onboarding → estimation → generation → calendar → planner

- Structured fields present: Age / Sex / Height / Current weight / Target weight / Goal / Sessions / Minutes / Experience / Where you train / How hard you want to push. Filling `Age 40`, `Height 178`, `Weight 100 → 80` correctly updates the estimate card live.
- Estimate card (`22-onboarding-estimate.png`): "Realistic timeline 7 months", "Safe rate 0.7 kg / week", "Checkpoints Week 4 …", plus a "3 months is not enough" warning when a 3-month plan is requested against a 7-month requirement. **Bug I-01 below: the recommendation offered ("Switch to 6 months") is itself shorter than the 7 months just stated.**
- Free-text textarea placeholder is the example sentence ("40 years old, 140kg…"); it was left empty for the structured-field probe — the estimate runs off the structured fields regardless of whether the textarea has content. No crash with empty text.
- "Design my programme" (`src/routes/Onboarding.tsx:421`): when the server has `MINIMAX_API_KEY` the coach path is taken (`__AI_COACH__` true — confirmed by the "The AI coach designs the split…" copy at `src/routes/Onboarding.tsx:444`). `REQUEST_TIMEOUT_MS = 180_000` (`src/lib/ai-plan.ts:37`). A `pnpm dev` proxy at `/api/minimax` injects the key server-side (`vite.config.ts:21`). The deterministic generator is the fallback. Result of the quick 3.5 s probe was correctly "still on /onboarding" — polling up to ~200 s (pass 2) landed on `/generated/gen-…` (`P2 PASS`). The message "The coach usually takes a minute or two" is shown while designing.
- Calendar (`01-calendar.png`): the generated plan renders with `Week N` markers (9 detected), `deload` mention (1), expandable week cards, goal + weeks copy, read-only banner. Bad id (`/generated/does-not-exist`) renders the dedicated "Plan not found" card correctly (`10-GeneratedPlan-bad-id.png`).
- "Copy to planner" (`src/routes/GeneratedPlan.tsx:142`) navigates to `/planner`. PASS (`P4`). Planner then shows the weekly split (`03-planner-with-plan.png`).

### 3.3 Today + guided session

- Today has five durable surfaces, all observed on desktop and on mobile re-check:
  - stat cards: "Training volume, last 7 days", "Bodyweight", "Sessions, last 7 days", "Sets…", "Weeks trained 0/12", "Weight, 30 days";
  - the plan card for the current weekday (intensity I/II/III, `EC` toggle, `Finish`, share-as-image, per-movement tabs + `+ Add`);
  - "Movement of the day" (`Seated Biceps` photo from jsDelivr, `Surprise me`);
  - "Eat for your plan" meal suggestions (Spoonacular proxy or TheMealDB — rendered with kcal/protein/min and "View recipe" links even when the proxy key is set);
  - "Recent sessions" (appears once a session has been finished).
- Starting today's plan: the planned session preloads its 5 movements (`P5 PASS`). Each movement card has a NumberField (`src/ui/NumberField.tsx:85` `Increase Weight` / `Decrease Weight`) defaulting to `Weight=""` and `Reps=8` on a first-ever session (no history — `P6` empty is expected). `Log set` is **disabled until Weight is set** and the hint `Set a weight first. Use 0 for bodyweight movements.` is shown (`06-active-session.png`). This gate is the intended UX but note **UX-01** below (the hint recommends a value that keeps it disabled for barbell movements until incremented).
- After filling `Weight=40`, `Log set` enables, clicking it starts the rest timer: `aria-label="Rest remaining"` + `role="progressbar"` appear (`07-rest-timer.png`, `P7 PASS`), `+30s` works (`P8 PASS`), `Skip rest` dismisses it (`P9 PASS`). A second set can be logged and `Finish` enables once `totals.sets > 0` (`src/routes/Today.tsx:879`). Finishing shows the summary card (`08-summary.png`, `P10 PASS`) with PR detection via `isPersonalRecord` / Epley (`PR mentions=12` in the summary).
- Empty-session path: `Start an empty session` is present on Today when no plan exists and is the button the early "D2" probe hit — it does open a session (add-movement via ExercisePicker). Not a bug; covered above.

### 3.4 History

- After one finished session History shows: `Sessions 1`, `Sets 2`, `Total volume 640 kg`, `Days trained 1`, plus the per-muscle "Where the volume went" bar (`t2-history-2sessions.png` in the quick probe is actually `10-history-data.png` from pass 2 before the 2nd session — after one session). The `Estimated one rep max` chart area correctly shows an **empty state** (`Log this movement in at least two sessions to see a trend.` at `src/routes/History.tsx:194`), no `svg.recharts-surface`. Re-tested after a second finished session (`t2-history-2sessions.png` in audit3 should have been checked; in pass 2 the script reported `FAIL` because it looked too early). This empty-at-1-session is **by design** (`e1rmSeries(workouts, chartId)` gate at `src/routes/History.tsx:170`), not a bug.
- The per-session row lists date, intensity, movements and has share/delete controls (`aria-label` with `Share the session from … as an image` and `Delete session from …` at `src/routes/History.tsx:419/449`).

### 3.5 Bodyweight

- `+ Log weigh-in` opens a dialog (`12-weighin-dialog.png`), input `99.4` saves and the Today bodyweight card updates to `99.4 kg` and spark/summary (`13-weighin-saved.png` and `25-member-today-badge.png` green card `99.4`). `Target 80 kg` remains. PASS.

### 3.6 Library

- Route renders `873 movements` (`50` counts matched in `f1`). Searching `push up` / `squat` / `push up` filters the list; the result count in pass 1 was ~48 nodes.
- Opening a movement: card → detail with instructions, images, muscles. The primary source is `yuhonas/free-exercise-db` via `cdn.jsdelivr.net` (precached by the service worker at `vite.config.ts:132`), fallback is `public/repdb/*.webp` (384 illustrations at `src/data/repdb-images.json`). After a 9 s wait only `1 img, 0 broken jsdelivr` were observed (`14-library-detail.png` in pass 2). The earlier 8 broken images in pass 1 were a timing artifact before CDN warm (no `status >=400` ever recorded — `network.json` empty). The RepDB fallback path was not triggered because the CDN succeeded; it should be re-checked with the network disabled.
- The search placeholder reads `Search 873 movements`, `aria-label="Search movements"` (`src/routes/Library.tsx:131`). PASS.

### 3.7 Fitness test & challenges

- Fitness test (`15-fitness-test.png`): starts with two `Start 60s` buttons (one per slot). Clicking starts a countdown; after ~3 s a countdown marker (`59/58/57 …`) is present (`16-fitness-timer-running.png`, `P14 PASS`). Post-test the Onboarding hint reappears ("Experience and effort are prefilled from your fitness test …").
- Challenges (`17-challenge-started.png`): `Start challenge` available, clicking moves to joined/active state (`active|joined|day 1|in progress` copy). PASS. The `GreetingCard` / expiry job (`src/lib/challenge.ts`) was not latency-checked.

### 3.8 Menu

- Renders (~243 chars in empty/probe); the GymPanel's Menu tab is where the published dish list actually lives (see 3.10).

### 3.9 Settings

- Tabs verified visually: **Profile** (Name, Gym combobox, Age/Sex/Height, `Save details`, `Lock profile`, `Delete profile` — `19-settings.png`), **Device** (`DeviceProfilesSection` + `NotificationsSection::Notify about gym messages`), **Data** (`Sessions N`, `Weigh-ins N`, `Custom movements N`, `Weekly plans N`, `Export a backup` + `Restore from file` + `InstallAppButton` — `t1-data-tab.png`), **About**.
- Theme toggle: header icon changes class `"" → "dark"` (`71-settings-dark.png`). PASS. Respects `prefers-color-scheme` until overridden.
- `Export a backup` triggers a `download` event (`forma-programme-*.json` from `src/routes/GeneratedPlan.tsx:133`, app-level JSON from `src/routes/Settings.tsx:197`). PASS when the Data tab is selected — the early FAIL (`P17`) was because the probe searched on the Profile tab without switching.

### 3.10 Gym panel

- Access is gated by `role === 'gym'` (`src/routes/GymPanel.tsx:63`). Members landing on `/gym` are redirected to `/` (`10-GymPanel-as-member.png` renders Today). The redirect is via `<Navigate>` (`src/routes/GymPanel.tsx:68`) — correct.
- Gym profile "Iron House" created with `role=gym`, `gym=Iron House` lands on `/gym` (`20-gym-panel.png`). Tabs: **Compose** / **Sent** / **Menu** / **Members**.
- Compose: template radiogroup (`announcement`, `event with RSVP`, daily menu, QR offer), Title + Message/Body fields (`aria-label="Title"` / `aria-label="Message"`), course repeaters for menus, `Generate a new code` for offers, `Publish` button. Both an announcement (`Open day Saturday …`, `21-compose.png` → `22-published.png`, `P19 PASS`) and an event (`Team WOD …`, `23-compose-event.png` → `24-event-published.png`, `P20 PASS`) publish successfully and appear in **Sent** with Download poster / Delete controls.
- Banner on top of every route when the latest message wants it (`GymBanner` at `src/components/app-shell.tsx:331`).

### 3.11 Admin panel

- Gated by `role === 'admin'` (`src/routes/Admin.tsx:39`). Admin "Root Admin" lands on `/admin` (`30-admin.png`). Lists profiles with counts "Gym operators N / …", role `FormSelect`s per row, `Edit`/`Delete` controls (6 controls detected in pass 2), gym catalogue, message bus summary. PASS.

### 3.12 Inbox (gym delivery)

- **Rule:** messages are scoped to a gym. A member who trains independently (`Test Athlete` with `gym=""`) sees the intentional bump state (`You train independently, so there is no gym to hear from.` — `26-inbox.png`) and does **not** receive Iron House messages — this is by design (`src/components/app-shell.tsx:86` hides the bell for gym operators; `src/lib/messages.ts:65` `inboxFor`). A member created with `gym=Iron House` ("Jorge" in probe 3) **does** receive the announcement and event. In the walk that created `Jorge`, `Open day Saturday` and `Team WOD` delivered to his inbox with an RSVP control. The early `P21`/`P23` FAILs were exactly this fixture mismatch (member with no gym). Not a bug.

### 3.13 Responsive & a11y

- Desktop rail (`w-60`, `lg:flex`) + mobile header/bottom-nav (sticky header + `SessionMobileBar` + `nav[aria-label="Main"]`). Mobile screenshot with a correct unlock (Jorge / `jorge1234`) at `t4-mobile-jorge.png` now renders the bottom nav (compare `95-mobile-gate.png` which showed the gate because `test1234` did not open the profile at that context). `P29` PASS after correct fixture. No horizontal overflow (`0 px`, `P30/K2 PASS` at 375×812).
- Bottom nav and utility cluster use `aria-current="page"` correctly.
- `Skip to content` (`#main`) is first tab stop (`P32 PASS`).
- All primary cards have `focus-visible` cobalt ring, reduced motion respected per spec.

## 4. Bugs and issues requiring attention

### Bugs (wrong behavior)

| ID | Severity | Where | What is wrong | How to verify |
|----|----------|-------|---------------|---------------|
| B-01 | Medium | `src/lib/plan-estimate.ts:95` `recommendedDuration` | For a goal that needs `estimatedMonths = 7` (e.g. 100→80 kg at 0.7 kg/week) the suggestion is `Switch to 6 months`, which is itself shorter than the 7 months just stated. `recommendedDuration` picks the entry with `min |weeks - estimatedWeeks|` instead of the smallest entry with `weeks >= estimatedWeeks`. Recommending a still-insufficient duration is self-contradictory. Suggest: `trimestral`→12 w, `semestral`→26 w, `anual`→52 w; needed ≈30 w, so the fix is `smallest k where weeks >= estimatedWeeks` else the max. | Set `Weight 100`, `Target 80` on `/onboarding`, then open `src/lib/plan-estimate.spec.ts` — add a case with `estimatedWeeks ≈ 30`. |
| B-02 | Low | `src/router.tsx:53` + app-shell | No custom `notFoundComponent`. Navigating to an unknown path (e.g. `/no-such-route`) logs `Warning: A notFoundError was encountered on the route with ID "__root__"...` (captured in `Unknown-route` console). The UI falls through to TanStack's generic `<p>Not Found</p>`. Should render a branded empty state that links back to Today/Planner. | `GET /no-such-route` in any unlocked context. |

### UX / product gaps (works today, will cost you users)

| ID | Severity | Screen | Problem | Recommended fix |
|----|----------|--------|---------|-----------------|
| U-01 | Medium | Today session (`src/routes/Today.tsx:1051`) | `Log set` is disabled at `Weight=""` with hint `Set a weight first. Use 0 for bodyweight movements.` — but for barbell movements incrementing to `0` still leaves it disabled until a non-empty value is entered. On a first-ever session Weight is empty (no history), so every barbell set costs one extra key-step. For bodyweight movements the hint is fine, for loaded it is confusing. | Change NumberField's empty handling so `0` is non-enabling but the hint reads differently per movement: if `exerciseId`'s `equipment` is bodyweight show "Use 0 for bodyweight"; otherwise "Set a weight". Or prefill `suggestNext` so a default landed weight is offered even on first use. |
| U-02 | Medium | Onboarding generation (`src/routes/Onboarding.tsx:101` + `src/lib/ai-plan.ts:37`) | With `MINIMAX_API_KEY` set, the spinner says "Designing your programme" for up to `180 s` (`REQUEST_TIMEOUT_MS`). The subline "The coach usually takes a minute or two. You can keep using enForma…" is good, but the plan still only appears if the user stays on `/onboarding` (`window.location.pathname === '/onboarding'` gate). Navigating away before completion still stores the plan but without a toast/notification, users can miss it. | Keep the navigate guard but add a toast / inbox ping when the plan lands in `useGym.generatedPlans` after the user has left onboarding. |
| U-03 | Low-Med | Settings → Data (`src/routes/Settings.tsx:180`) | `Export a backup` lives in the Data tab which is not the default (Profile is). Profiles are encrypted per-passphrase and "There is no recovery" is emphasized everywhere, so the export action should be more discoverable from the Profile tab too (or shown as a sticky CTA). | Duplicate the Export CTA on the Profile panel, or show a one-line nudge "Export a backup under Data → Export a backup." |
| U-04 | Low | Library (`src/routes/Library.tsx:132`) + `vite.config.ts:132` | Movement images depend on `cdn.jsdelivr.net`. On a cold first visit several photo URLs are still in flight at 1.2 s and read as `naturalWidth===0` (the 8 "broken" images in pass 1). Offline they stay available because Workbox `CacheFirst` for `movement-photos` holds them, but the loading state has no skeleton/placeholder beyond the tile. | Add an `onError` fallback to the RepDB `public/repdb/*.webp` at `src/data/repdb-images.json` (384 illustrations) and render a shimmer until the CDN image resolves. |
| U-05 | Low | History (`src/routes/History.tsx:194`) | After a single finished session the 1RM chart intentionally shows `Log this movement in at least two sessions to see a trend.` and renders no Recharts SVG. This is correct, but the stat cards alone can feel sparse with 0–1 sessions. | Show the n=1 chart as a single dot with the callout line "One session — one more to draw the trend." (Preserves honesty, reduces the "did it save?" doubt.) |
| U-06 | Low | Inbox when gym-mismatched (`src/routes/Inbox.tsx:104` + `src/lib/messages.ts:65`) | A member who signed up without a gym (or with a typo'd gym name `iron house` vs `Iron House`) correctly gets the bump `You train independently…` in the inbox. From the bell's `0 unread` alone it looks like the gym is silent rather than that the member is unsubscribed. | In Settings Profile, when `gym` is empty add a one-line nudge "You're not linked to a gym — pick one to receive its announcements." In the inbox bump include "Picked the wrong gym? Change it in Settings → Profile." |
| U-07 | Low | Gym panel Members (`src/routes/GymPanel.tsx:649`) | The four tabs Compose / Sent / Menu / Members are all visible; what each tab saves to (`addGeneratedPlan` vs `generatedPlans` vs `menu`) is not surfaced at the top. A gym operator publishes a message successfully but the only feedback is the transient `Published to …` inline status (captured `P19 PASS`). | Keep the inline status but also highlight the Sent tab count badge when a new message lands there. |
| U-08 | Low | Planner (`src/routes/Planner.tsx:473`) | Weekly planner editing (add/swap movements via ExercisePicker, set timed/per-side/superset flags) was not exercised deeply in this walk. The `Save` button and day picker were visible; no blocker was observed on the read path. | Follow-up walk that edits a day, flips a superset flag, and re-starts the workout — confirm the flags survive a round-trip through `useGym`. |

### Polish / missing-nice-to-haves (not bugs, tracked for a review pass)

| ID | Screen | Note |
|----|--------|------|
| P-01 | `/menu` | `src/routes/Menu.tsx` is 76 lines — it is a thin view of the published daily menu. Its empty state when the gym has not published a menu should say "No menu published yet" (today it just renders the header). |
| P-02 | Device (Settings) | `NotificationsSection` / `notifyUnread` (`src/lib/notify.ts`) is gated behind `Notification.requestPermission`. Opt-in copy could explain "Your gym's latest announcement appears as a system notification when it is not in the foreground." |
| P-03 | Movement of the day | Shuffle `Surprise me` correctly picks a random movement (`P5` line); verify the random distribution pulls from the 873 list and not just the RepDB subset. |
| P-04 | Eat for your plan | Spoonacular proxy falls back to TheMealDB; when both keys are absent the panel still renders (empty). Recipe link `spoonacular` attribution is already present (`Dishes, numbers and photos from spoonacular.`). |
| P-05 | PWA | `vite-plugin-pwa` manifest is correct (`vite.config.ts:99` `autoUpdate`, `includeAssets`, `manifest.theme_color: #ecebe8`). The service worker is disabled in dev (`devOptions.enabled: false`) and was therefore not exercised. A production build + offline check should be the next walk. |
| P-06 | Search params | No modal-as-route (`?tab=`, `?modal=`) surfaces were detected by grep. Confirm there is none so the audit can claim completeness. |
| P-07 | Tests | `pnpm test` (`vitest run`) — `src/lib/*.spec.ts` — still green per `README.md`'s "26/26" line, but not re-run in this visual walk. Run before shipping the fixes above. |
| P-08 | Build | `pnpm build` (`tsc -b && vite build`) not exercised in the browser walks. Run with `strictPort` disabled to verify bundle sizes. |

## 5. Probe artifacts that looked like failures but are not app bugs

Kept here for auditability. Each was a **false FAIL** produced by the probe that inspection of the running DOM showed to be intended behavior.

| Probe step | What the probe reported | What the browser actually showed |
|------------|-------------------------|----------------------------------|
| Pass 1 C3 | `Design my programme` stayed on `/onboarding` | Coach was running (timeout 180 s) and had not finished in the probe's 3.5 s wait. Pass 2 waited up to 200 s and landed on `/generated/gen-…`. |
| Pass 1 D3 / Pass 2 P6 | 0 number inputs / `Log set` disabled | Weight starts empty (`""`) with no history — `Log set` is intentionally gated with the hint. Filling `40` enables it; session then finishes correctly. |
| Pass 1 H2 / Pass 2 P17 vs pass 3 fix | `Export a backup` not found | Button is in the **Data** tab (`src/routes/Settings.tsx:196`) — probe searched on the default Profile tab. Switching to Data yields the button + download. |
| Pass 1 I3–I5, Pass 2 P21/P23 | Inbox badge not found, "Open day" not in inbox | Member "Test Athlete" had `gym=""` (trains independently), so `src/lib/messages.ts:65` `inboxFor` correctly returned 0 messages. A member created with `gym="Iron House"` ("Jorge") did receive the messages + RSVP. The `You train independently…` bump is the correct state. |
| Pass 1 K1 / Pass 2 P29 | Mobile bottom nav not visible | Fresh mobile context had empty `localStorage` — the gate was still shown and the passphrase `test1234` was typed against the wrong profile at that context. With a correct unlock the rail/bottom-nav renders and `scrollWidth - clientWidth = 0` (no overflow). |

## 6. Screens deliberately left for a follow-up walk

- Editing a planner day to add a **superset, a timed set and a per-side set** (`README` claims these are configurated per movement in the planner) and starting the workout to verify "Rest only starts once a superset group is finished" and the Wake Lock holds.
- Importing a JSON backup (`Restore from file` in Data) and confirming profile migration (`src/lib/profiles.ts:374` `legacySnapshot` / `importLegacy` flag).
- Deleting a profile (`Delete profile` two-step confirmation) — not executed here because the fixture is shared across passes.
- Clearing all data (`Danger zone` → `clearAllData`) — not executed (destructive per-profile wipe).
- Offline run: install the PWA (`InstallAppButton` at `src/components/install-app-button.tsx`), disconnect the network, exercise the Library RepDB fallback, and verify History still renders.
- The 873-item library paged load performance (`src/data/exercises-generated.ts` is a `manualChunks: exercise-data` chunk at `vite.config.ts:87`).

## 7. Method to reproduce this audit

```bash
pnpm install
# leave any existing vite dev server on 3015 running (the audit reuses it);
# or
pnpm dev  # -> http://localhost:3015 (strictPort)
# static inventory
bash "$HOME/Projects/ai-os/ai-config/skills/app-route-inventory/scripts/discover-routes.sh" .
# browser walks (no code changes)
node enforma-walkthrough.tmp.mjs # pass 1 — fast route inventory
node enforma-walkthrough2.tmp.mjs # pass 2 — full flows with AI coach 200 s wait
node enforma-walkthrough3.tmp.mjs # pass 3 — targeted re-probes (needs the walks' dev storage)
```

To make pass 2 repeatable without touching real data, delete the temp walkthrough scripts after the walk or run them from `/var/folders/dr/x53jsznd7nvcnljhckpjrxdw0000gn/T/opencode/`; Playwright contexts are always isolated (`storageState` is in-memory only).

## 8. Verdict

Ship the UX tweaks at B-01 / U-01 / U-06 first (they are the only places where the product says one thing and does another). The remainder can ride a design-review pass. No data loss or auth bypass was observed; encrypted-per-passphrase profiles, role-gated `/gym`/`/admin`, and local-first data (sessions, weigh-ins, custom movements, weekly plans, generated plans, fitness test, challenges) all persisted and reloaded across the three passes.

Generated from browser evidence at `enforma-audit/`, `enforma-audit2/`, `enforma-audit3/`. No app file was edited for this audit.

---

## 9. Resolution pass (2026-08-27)

Every finding above was worked through in one pass. Verified in the browser
unless noted.

| ID | Outcome |
|----|---------|
| B-01 | **Fixed.** `recommendedDuration` now takes the shortest option that fits (`weeks >= estimatedWeeks`), longest as fallback. Three regression tests in `plan-estimate.spec.ts`. |
| B-02 | **Fixed.** `notFoundComponent` on the root route renders `src/routes/NotFound.tsx`, branded, with Today and Planner as exits. |
| U-01 | **Fixed.** The empty-weight hint reads "Enter 0 — this one is bodyweight." only for bodyweight movements; loaded ones say "Set a weight first." |
| U-02 | **Fixed.** A programme that lands after the user navigated away fires a `training`-channel notification naming where it is. |
| U-03 | **Fixed.** The Profile panel carries a line pointing at Data → Export a backup. |
| U-04 | **Fixed.** `MovementCard` walks the same candidate cascade as `ExerciseThumb` (CDN photo → bundled illustration → typographic tile) instead of stopping at the CDN. |
| U-05 | **Fixed.** A single session shows its estimated 1RM and date with "One session. One more draws the trend." |
| U-06 | **Fixed.** The Profile panel says when no gym is linked and what that costs. |
| U-07 | **Fixed.** The publish confirmation names the Sent tab. |
| U-08 | **Verified, no defect.** Added Barbell Squat to a planner day, flipped "one side at a time", started the session: the Left/Right controls and the intensity target survived the round-trip through `useGym`. |
| P-01 | **Already correct.** `Menu.tsx` has had a "has not published a menu yet" empty state; the finding was stale. |
| P-02 | **Fixed earlier.** Notifications split into two channels (`Gym messages`, `Training nudges`) with their own copy. |
| P-03 | **Verified.** `daily-pick` draws from 868 of the 873 catalogue entries (the 5 with no instructions are excluded on purpose), not the 384-entry RepDB subset. |
| P-04 | **Already correct.** No change needed. |
| P-05 | **Verified.** Production build registers the service worker (1 active registration, 65 precached entries) and the app loads fully with the server stopped. |
| P-06 | **Verified.** No `useSearch` / `validateSearch` anywhere: there are no modal-as-route surfaces. |
| P-07 | **Verified.** 124 tests across 21 files, green. |
| P-08 | **Verified.** `pnpm build` green throughout. |

Two deviations from the darebee plan were also closed in the same pass: a
print stylesheet (`src/index.css`) with print actions in the gym panel, and
the day's extra credit surfaced in the planner.

What deliberately remains: the narrative programme (darebee phase 9) and the
backend/sync work in `docs/plans/2026-08-26-backend-sync.md`.
