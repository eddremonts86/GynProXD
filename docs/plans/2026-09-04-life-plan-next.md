# What to do next, in order

Status: the working list. Date: 2026-09-04.

`feat/member-pro` is merged into `dev` (PR #105, 2026-09-04). Everything in
`2026-09-03-life-plan-v2.md` marked built is built and walked; that document's
"What is still open" section is the inventory, and this one is the order to do
it in.

Everything still open on this list is somebody's errand rather than a commit,
and `dev` is where it is now tracked from.

The order is by what each item unblocks, not by how big it is. Three of the
first four are minutes of work, and they come first because they turn features
that already exist into features that work.

---

## 1. Merge, when the flow is finished

Done. Item 11 was the last code on this list, so the flow this was waiting for
finished and the branch landed on `dev` as PR #105 on 2026-09-04.

Verified on the branch before it merged, after the push channel landed:

| Check | Result |
|---|---|
| Unit tests | 861 pass, 68 files |
| `run.mjs rules` | 11 of 11 |
| `run.mjs screens` | 22 of 22 |
| Lint, types, build | clean |

The screens walks were run against a built `dist` on port 3016 rather than the
agent preview pane, which serves the repository root and not a worktree. Both
`test-session` and `test-onboarding` pass there; they fail with 502s only when
nothing sits behind `/pb`, which is the harness and not the product.

**One thing this table used to claim that it could not.** CI had never run on
`feat/member-pro` before the day it merged — the only run on that branch is the
one that gated the PR. Every earlier "22 of 22" in this file was measured on a
laptop. The guardian's own verdict, on the merge commit, is the four checks on
PR #105.

**And one flake worth naming, because it will happen again.** The first CI run
failed on `lighthouse-sweep` alone: `/` on mobile scored 64 against a floor of
82, with LCP 4.1s against a 3.8s ceiling. It was runner variance and the re-run
passed untouched. What ruled out a regression before the re-run was measuring
the first paint rather than guessing: `dev` pulls 827 KB through `index.html`
and the branch pulls 841 KB, the same chunks and 1.7% more, while the audit in
`docs/audit/2026-09-02-production-readiness.md` records 89 and 3.1s for that
page. Fourteen kilobytes do not cost 25 points. Mobile Lighthouse throttles the
CPU 4x, so a contended shared runner hits that one metric and nothing else.

## 2. The keys and the prices

Half an hour, and three built features stop being demos.

- `TICKETMASTER_API_KEY` — free, developer.ticketmaster.com. Turns on the
  events strip under `/day`. Without it the strip is absent by design.
- The four Stripe prices, created with the lookup keys in
  `deploy/pocketbase/pb_hooks/utils/billing.js`:
  `enf_sub_base_eur_month`, `enf_sub_plus_eur_month`,
  `enf_sub_enterprise_eur_month`, `enf_sub_pro_eur_month` (EUR 15, the member
  one). There is deliberately no price id anywhere in this repository.
- `COACH_BASE_URL=https://api.deepseek.com/v1` and `COACH_MODEL=deepseek-chat`
  if the coach should be DeepSeek. Two variables, no code. MiniMax answers the
  day read acceptably and drifts towards generic advice; DeepSeek should follow
  the prompt more closely, and it is untested here for want of a key.

## 3. Ask Stripe, in writing

One email, and the answer can move the billing of the whole product.

The question, unchanged since the v1 plan called it Task 0.2 and now concrete:
**may enForma bill through the account that also collects builderhunt's and
HunterReady's revenue, now that the product contains the intimate activity
module?** Send them the module as it is: text and illustrations in a clinical
register, no photography, no video, age-affirmed and off by default.

It goes third rather than later because the reply takes days and everything
downstream of it waits: if the answer is no, the module moves to its own
account or the company moves processor.

## 4. The twenty illustrations — dropped

The illustration slot is out of the design: no `art` field, no frame, no
`public/intimacy/`, no brief. `docs/intimacy-illustrations.md` is deleted and
`ATTRIBUTION.md` no longer reserves a section. The cards are text.

Why, after the slot was built for them: the three routes in the old brief all
closed. A generative model was tried on the real entries and MiniMax `image-01`
refused four of eleven requests outright and sanitised the rest — separate
chairs instead of one arrangement, invented rooms, one figure where there were
two — which is the stand-in artwork the module's own rule forbids. Freely
licensed material does not intersect the twenty: Wikimedia's *Sex positions*
category holds three CC0 files and all three are typology charts, the
public-domain volume is historical erotic art with no props and no clinical
geometry, and the only set whose arrangements match ours is CC BY-SA, so any
edit of it would come back share-alike with attribution. That leaves one
illustrator at a fixed fee, which is not being paid for right now.

The empty frame was a defensible ship state and this is the other one: the
paragraph beside each entry already carries the arrangement in words, which is
what the module is actually for. If the drawings are ever commissioned, the
twenty per-entry references written during this attempt are the brief.

## 5. Privacy policy and terms

Needed regardless, and it is the item that blocks a real user of the calendar:
Google's verification requires a published privacy policy, so item 6 cannot
start without this one.

What it has to cover that it did not before: a server holding a Google refresh
token that can read a calendar, a five-kilometre location cell, and the day's
labels being sent to a model provider. All three are stated in the interface
already; this is the same statements in the place a policy lives.

## 6. Google's sensitive-scope verification

Weeks, not days, and none of it is code.

`calendar.events.readonly` is a sensitive scope. Google wants the consent
screen configured, the domain proved, the privacy policy published, a written
justification for the scope, and a video demonstrating the flow. Until it
passes, the connection works for up to 100 users behind an unverified-app
warning, which is enough to test with and not enough to launch on.

## 7. Apple Calendar — done

Built and walked. CalDAV, an app-specific password the member generates in
their Apple ID settings and types in, verified with one `PROPFIND` before it is
stored, on the `calendar_links` table with `provider` set to `apple`. Two
providers can be attached at once and one pull never touches the other's
blocks.

The one decision worth knowing: the server relays the raw iCalendar and the
device parses it with the reader the file import already uses. Expanding
recurrences server-side would have forced UTC on the answer, and turning UTC
into wall-clock hours across a three-week window that may contain a
daylight-saving change needs a timezone database the browser has and that
process does not.

It needs no configuration of its own. The 32-character `CALENDAR_SECRET` from
item 2 is the only thing it wants, and `/api/enforma/capabilities` reports the
two providers separately so a server can offer one and not the other.

## 8. The +18 library, connected — done

Built and walked.

- What is being worked around is remembered on the device, beside the switch
  and the affirmation and never in the synced record, because a half hour on
  somebody's Tuesday cannot suggest anything if nothing remembers that their
  back is the problem. The screen says where it is kept; Settings forgets it.
- `/intimacy` gains "For your half hour today", one arrangement chosen from
  what survives those limitations, the same all day and different tomorrow.
- **The day's block keeps its neutral label and leads there instead.** Putting
  an arrangement's name on the timeline would undo the reason the label is
  `Time together` in the first place.
- A model may choose from the library on a tap: the sentence and the ids go
  out, ids come back, an invented one is dropped. The limitations never
  travel — they filter the pool before and after — so it cannot put something
  unkind on screen and never learns what the body is working around.

## 9. The revoked-grant walk — done

The fake Google can withdraw a grant now: the next refresh fails with
`invalid_grant`, the way one taken away in somebody's Google account does, and
a fresh code exchange clears it because that is what reconnecting is.

Walking it settled a question the code had not answered. **The blocks stay.**
The row is ours and only the credential is gone, so reconnecting is one button
rather than a fresh start, and what the calendar already put on the day was
true when it was read. The copy says exactly that: the calendar cannot be read
again, and what it already put on your days stays until you reconnect or
disconnect. Deleting it on one refusal would be harsher than the case deserves,
and the stale-mirror rule still covers the case where the link is genuinely
gone.

It also caught an inconsistency: the titles switch said "on this device" and
lived in component state, so a reload forgot it, and the round trip through
Google's consent screen is a reload. It is stored on the device now, which is
what it always said.

## 10. Microsoft Calendar — done

Built and walked. Graph, `Calendars.Read` and `offline_access`, no
sensitive-scope verification to wait for. Three providers can be attached at
once and one pull never touches another's blocks.

Two things it does not share with Google. Graph returns naive times plus a
timezone name rather than an offset per instance, so the device sends the zone
it is in and Microsoft does the daylight-saving arithmetic; the zone is
validated before it goes anywhere near a header. And Microsoft rotates the
refresh token on every exchange and refuses the old one, so the rotated one is
stored on each read: missing that would have given a connection that reads once
and then claims it was withdrawn.

The signed state moved to `utils/oauth_state.js` on the way, because it is the
one security-relevant function in the calendar code and two providers now need
it. Each provider panel also gained an accessible name, which the screen reader
wanted anyway and which the walk needed to tell three "Read it again" buttons
apart.

## 11. Push from Google — done, and the cursor is not coming

Built and walked. Google opens a channel when the calendar is connected, says
"this calendar changed" at `/api/enforma/calendar/google/notify`, and the day
re-reads once as the screen next opens. A cron renews channels hourly and a
disconnect closes one; `POST /api/enforma/calendar/channels/renew` runs the same
pass for a superuser, which is what let the renewal be walked rather than
reasoned about — the pattern is `recipes.pb.js`, which pairs its nightly cron
with exactly such a route.

**The notification carries no events, which is the whole reason it is cheap
enough to want.** The server writes a date on the link; the device does the
reading, because the device is the only thing that holds the member's day. So
nothing about the privacy story moved: this server still keeps a token and two
dates.

Three things were settled by walking it rather than by reasoning about it:

- **Two things have to agree before a notification is believed**: the signed
  token the channel was opened with, which names the account, and the channel id
  matching the one currently on the row. The second is what makes a rolled
  channel's notifications useless while its signature is still good.
- **Everything is answered 200**, including both forgeries. Anything else is
  retried by Google with a backoff, and there is nothing to retry — saying more
  would only tell whoever sent it which half of their guess was right.
- **The `sync` handshake is not news.** Google sends one the moment a channel
  opens; treating it as a change would have every member pull once for nothing
  on every renewal.

`GOOGLE_WATCH_ADDRESS` is the only new configuration and it is optional. Google
pushes only to a domain verified in the Cloud project, which is a separate
errand from item 6, so a server that has not done it leaves the variable unset:
no channel, nothing failing, and the member keeps the "Read it again" they had
before any of this existed.

### The cursor, and why it stays unwritten

This item asked for the `cursor` column too, "both together or neither". Only
the push was built, and the reason is that a cursor does not fit this design
rather than that it was too much work.

`syncToken` cannot be combined with `timeMin`, `timeMax` or `orderBy` — the
three parameters the three-week read is made of — and there is nowhere here to
apply a delta to: the server stores no events, so the only copy that could be
patched is the one on the device. `updatedMin` would fit the window, but the
device replaces its whole mirror for a provider on every read and its blocks
carry no event ids, so a delta would mean keying the day by Google's ids and
merging two sets of blocks. That is a change to the day model to save bandwidth
on a read already capped at 250 events.

It stays unwritten until a read is expensive enough to be worth the merge. The
reasoning is in `1758900000_calendar_watch.js`, where somebody adding the column
will look first.

---

## Only when something asks for them

- **Write-back** into the member's calendar. The `.ics` export covers it, and
  read-only is what keeps item 6 tractable.
- **PredictHQ** behind `/api/enforma/events/near`, if Ticketmaster's ticketed
  subset turns out too thin. A key and a mapping.
- **Ranking the nearby events** in the day reading. They go in as context now;
  there is no verdict on which are worth going to.
- **Weather** in the reading. An "if we fetch it" nobody decided.
- **The DPIA.** It gates a log of the intimate activity module, and nobody has
  asked for one. No log, no streak, no count and no calorie figure stay absent
  until it exists.
