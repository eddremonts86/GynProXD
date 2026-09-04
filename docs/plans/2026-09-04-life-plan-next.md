# What to do next, in order

Status: the working list. Date: 2026-09-04.

`feat/member-pro` is on the remote and not merged. Everything in
`2026-09-03-life-plan-v2.md` marked built is built and walked; that document's
"What is still open" section is the inventory, and this one is the order to do
it in.

The order is by what each item unblocks, not by how big it is. Three of the
first four are minutes of work, and they come first because they turn features
that already exist into features that work.

---

## 1. Merge, when the flow is finished

`feat/member-pro`, pushed and not merged. Deliberately waiting: the flow is
being finished before it lands.

Verified on the branch as it stands:

| Check | Result |
|---|---|
| Unit tests | 846 pass |
| `run.mjs rules` | 11 of 11 |
| `run.mjs screens` | 22 of 22 |
| Lint, types, build | clean |

Two of the screens walks (`test-session`, `test-onboarding`) fail with 502s
unless a sync server sits behind `/pb`. That is the harness, not the product:
run them with `scripts/audit/sandbox-serve.mjs` and `POCKETBASE_URL` pointed at
it and both pass.

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
account or the company moves processor, and the illustration commission in the
next item is priced against a different set of terms.

## 4. Commission the twenty illustrations

Already in motion. `docs/intimacy-illustrations.md` is the brief to send for
quotes: twenty drawings, flat vector, 1200x900 WebP named by entry id, what has
to be visible in each, and the licence to buy.

Longest lead time on this list after Google's verification, so it runs in
parallel with everything below. The three routes to price, in rough order of
cost, are in the brief. The middle one — a generative model corrected by an
illustrator — has to be confirmed in writing vendor by vendor first, because
most image APIs forbid sexual content in their terms even for non-explicit
anatomical work.

Nothing in the code waits on this. The frame, the alt text field, the
attribution section and the file naming all exist; the first delivered file is
one asset and four lines.

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

## 9. The revoked-grant walk

An afternoon. A withdrawn Google grant answers 409 and the screen says to
connect it again, and no walk exercises that path because the fake Google never
revokes. Teach it to, and assert the sentence.

## 10. Microsoft Calendar

Graph, OAuth, the same shape as Google and lighter verification. Cheap once
item 7 has generalised the table's second provider.

## 11. Push from Google, and the cursor

Watch channels so a moved meeting appears without being asked for, plus the
`cursor` column that makes an incremental read possible. They go together or
neither: today every pull re-reads the whole three-week window, which is why
no cursor is needed yet.

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
