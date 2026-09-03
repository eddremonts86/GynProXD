# What is left

Every feature the pricing page sells as shipped is shipped. This is what is not:
one card still marked `Coming`, the inside of a tier already advertised, and the
things noted while building the rest.

Two entries below are marked **Done** rather than deleted, because what they say
about why is worth keeping.

Written down because each of these was found and then said out loud once, in a
conversation. A thing everybody has half-remembered is a thing nobody owns.

---

## 1. Enterprise: one account, several gyms

**Status: built.** `users.gym_cap` is the integer, a hook on `gyms` refuses the
gym past it on the only path that creates one, and `/gym` offers a switcher
when an account runs more than one room, remembered per device. Proved from the
API by `gym-cap-boundary.mjs` and through the app by `test-enterprise-rooms.mjs`.

It was built exactly as the design below describes, and the design is kept
because the reasoning for a cap rather than an `orgs` collection is the part
worth re-reading before somebody adds one. It matters that this is the same
feature as `second-rooms`, priced: that card is now the only thing left.

- €1,000 a month, up to five gyms under one account.
- Plus at €300 stays exactly one gym.
- More than five: talk to us. Not a different feature — a different integer.

The price was €500 in the first draft, then €800, and settled at €1,000 because
that is exactly what five gyms on Base would cost — so the page can say "the
same money, with everything Plus has on all five", which a reader can check.
€800 was going to be sold as "save €200", and €200 is only true against Base
pricing, which would have meant the most expensive tier had fewer features per
gym than a single Plus account.

## 2. `second-rooms` — retired, not shipped

It was the last card marked `Coming`, and it is gone from the Plus list rather
than ticked. Those are different things and the difference is the point.

"Two locations under one account, each with its own roster and its own inbox" is
what Enterprise sells. It is not something a single gym paying €300 gets, so
leaving the row on the Plus card and marking it built would have told that
customer they had several rooms. The proposition now lives on the Enterprise
band, where it is priced, and that band names the switcher the desk grew.

The recommendation this entry carried was "do not build rooms, build
Enterprise, and let the card mean that". That is what happened. The reason it
gave still holds and is worth keeping: a roster is a list on a gym that already
exists, while more than one location asks what a gym *is* in the data. The
answer turned out to be that it asks nothing, because `gyms.operators` is
already a list per gym.

The Plus card now has nothing marked `Coming`, and the paragraph that explains
what `Coming` means is behind a guard so it does not render as an empty box.

## 3. Stripe — built, in test mode

`1757900000_gym_plan.js` said why `gyms.plan` was a text field a person set by
hand: there was no Stripe, and a subscription state machine with no payments
behind it is a mechanism pretending to be a fact. There are payments behind it
now.

**The shape is one-directional.** Nothing in the product ever asks Stripe a
question. The webhook writes `gyms.plan` and `users.gym_cap`, and every gate
keeps reading those two fields exactly as it did when a human set them. A Stripe
outage cannot decide whether a gym may publish tonight, and the plan check still
has no network call in it.

**The subscription hangs off the owner account, not the gym.** One Enterprise
subscription covers several rooms, so putting it on a `gyms` row would make one
of five rooms hold the truth for the other four.

**What happens when the money stops** is a product decision, written down in
`utils/billing.js` where it can be read: `canceled` and `unpaid` drop every gym
the account owns to `base` and the cap to one, and destroy nothing. The roster,
the history, the messages and the members all stay, so paying again is a webhook
rather than a rebuild. `past_due` changes nothing at all, because Stripe is
still retrying and taking a customer's kitchen away over one failed retry is how
an expired card becomes a cancellation.

`billing-boundary.mjs` computes Stripe's own HMAC and asks the questions from
outside: unsigned, wrongly signed, signed for different content and signed an
hour ago are all refused; a real event moves the plan and the cap; cancelling
leaves the gym standing. The checkout route was also exercised against the real
Stripe test API, which returned a session and stored the customer.

### Still to do

- **Live keys and a live webhook.** Everything above is `sk_test`. The account
  currently in use is the fleet's shared BuilderHunt test account; enForma has
  its own products in it (`enf_sub_*`) but should have its own account before
  anybody is charged.
- **A button.** There is no UI that calls `/api/enforma/billing/checkout` yet:
  the route exists and is proved, and the gym panel still shows what a person
  provisioned by hand.

## 4. The gym applications queue is still hands-on

`/admin` → Applications collects a row and grants nothing: no gym, no operator,
no reach. Somebody reads it and runs the provisioning script. That stays
deliberate. A gym is a paying account with a member roster, not something a form
conjures, and a provisioning button that half-works is worse than a script
somebody runs on purpose.

**What was actually broken is fixed.** The complaint was never that a person
runs it, it was that Enterprise made each customer five runs of a script that
did not know about owners, plans or caps. `grant-gym.mjs` now takes `--owner`,
`--plan` and several `--gym` names in one run, raises `gym_cap` to match
*before* it makes the rooms, and is idempotent. It refuses `--plan enterprise`
in words, because Enterprise is not a plan value: it is one account owning
several Plus rooms, and `gyms.plan` holds eight characters anyway.

`provisioning-boundary.mjs` runs the real script against a throwaway server on
every pull request. Nothing exercised it before, so a renamed field would have
been found by a person mid-provisioning with a customer waiting.

A button is still worth building the day the volume is real.

## 5. Geography on the open door — built, and the promise rewritten

A member may write a town or a postcode on their own account, and a gym may aim
one open-door message at a place. Both are optional and empty by default.

**This changed a promise, which is the part worth reading.** The page used to
say, in these words: "there is no location filter. We hold no location for
anybody, and we would rather say so than imply a segmentation that does not
exist." That was true and worth saying, and it is no longer what the product
does. The copy now says what it does: you can aim it at a town or a postcode,
it reaches the people who wrote that place themselves, and you are never told
who they are, how many, or whether anybody was there at all.

What did not change is the thing that made the open door acceptable. The filter
is an arm of the read rule, evaluated on the server against the reader's own
row, so aiming buys a gym nothing it did not already have. `users.area` sits on
the member's own record, which is `id = @request.auth.id`, so no other account
can read it. `open-door-boundary.mjs` asks the new question the same way it
asked the old ones: from the gym's side, whether naming a place has become a way
to count who is in it. It has not.

Both sides are lower-cased and trimmed on write, because the rule matches
exactly and cannot normalise. Without that, "Lisboa" against "lisboa " is a
message that silently reaches nobody, which is the worst possible failure for a
feature a gym gets one shot a month at.

There is deliberately no list of valid places. A fixed list is a product
decision nobody has made, it is wrong in every country it was not written for,
and it turns "where do you train" into a question you have to be in the right
city to answer.

## 6. Promote the audit walks to required checks

**Done for `Audit the rules`, on both `main` and `dev`.** It is ten seconds,
no browser, no clocks, and it guards the collection rules every boundary in
this product rests on. The condition this entry set, a few green runs first,
was met decisively: 25 runs, 25 green, no flakes, across a day of real merges.

**`Audit the screens` still runs on every pull request and still is not
required.** Same 25 for 25, so the evidence is there, but its failure mode is
different: eight minutes, a browser, and two walks that wait on real clocks by
design, because a schedule tested against a mocked clock only proves the mock
works. A flake there blocks a release rather than catching a bug. Promoting it
is one entry in branch protection whenever somebody decides that trade is worth
making; the walks themselves are already the thing that would have to hold.

## 7. Week 1 of a plan that starts mid-week

**Done.** Weeks are calendar weeks now: the first holds whatever training days
are left in it and each one after is the full pattern in order. A Sunday start
with a Monday/Wednesday/Friday week moves the grid forward rather than opening
with an empty week.

The knock-on was worth the tests: `programmeFromPlan` recovered each block from
the first week that used it, and the first week can now be short — a gym would
have published a two-day week to every member because of the day its designer
happened to press the button.

---

# Enterprise, designed

## The shape that costs almost nothing

`gyms.operators` is a list **per gym**, and twenty collection rules ask "is this
account in this gym's operators list". One account appearing in five of those
lists already works, today, with no migration and no rule touched.

So Enterprise is not a new level of the data model. It is a cap:

```
users.gym_cap   integer, default 1
```

- Plus: `gym_cap` 1. What every gym has now.
- Enterprise: `gym_cap` 5.
- More than five: the same field, set to whatever was agreed.

That last line is the whole argument for this shape. "Up to five" and "call us
for more" are the same feature differing by an integer, which is what the ask
actually described: as many as we like, configurable.

## The alternative, and why not yet

An `orgs` collection — name, plan, cap, owner — with gyms pointing at it. That
is the right shape the day something is genuinely org-wide: one bill, reach
across all five gyms, a member who belongs to the organisation rather than to a
branch.

None of those exist. Until they do, an org row is a level of indirection that
every rule has to traverse to answer a question it can already answer, and the
plan check moves from the row that owns the answer to a row one hop away.

**Recommendation: the cap on the account. Revisit `orgs` when org-wide reach or
one bill is actually being built.**

## What actually needs writing

The server is nearly done already. The client is where the work is.

1. **`users.gym_cap`**, and the provisioning script sets it. One migration.
2. **A cap check when a gym is created or an owner is assigned.** Today only a
   superuser makes a gym, so this is a guard on the provisioning path rather
   than a public endpoint — but it belongs on the server, or the cap is a note
   in a spreadsheet.
3. **`operatedGymId` → `operatedGyms`.** It currently does
   `gyms.find(g => g.operators?.includes(userId))` and returns the *first* — the
   one place in the codebase that assumes an operator has one gym. One caller.
4. **A gym switcher in `/gym`.** The panel takes its gym from the session
   profile's single `gym` name, so this is the real work: which gym am I looking
   at, remembered per device, and every panel — compose, sent, members, desk,
   menu, colour — reading from the choice rather than from the profile.
5. **Nothing about members changes.** A member belongs to one gym, which is a
   branch. That is correct: they train somewhere, not at a holding company.

## What Enterprise should *not* quietly become

- **A cross-gym inbox.** Publishing to all five at once is a new audience, and
  every audience in this app has cost a boundary audit to get right. If it is
  wanted, price it and build it deliberately, not as a side effect of the cap.
- **Aggregated reach.** "Five gyms, one number" is a real product and a
  different one; the reach panel counts what members of *a* gym did.
- **A discount ladder nobody enforces.** Five gyms at `plan: 'base'` and a
  `gym_cap` of 5 is €500 for what should cost €1,000. Both fields are set by a
  human today, so this is a provisioning checklist, not a hole — but it is worth
  writing on the checklist.

## The honest question first

Is there a customer? A data-model change with no one asking for it is risk with
no return, and this one is cheap precisely because it does not change the data
model — so it stays cheap if it waits.

The €500 line on the pricing page, though, can be written before any of it
exists, the same way €200 and €300 were: *we invoice*. A third column that says
"up to five gyms, talk to us" costs a paragraph and tells us whether anybody
wants it before we build the switcher.
