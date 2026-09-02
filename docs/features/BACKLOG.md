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

**Status: sold, not built.** The third column is live at €1,000 for up to five
gyms. Behind it an account still holds exactly one, and provisioning five is
five gyms of manual work — so this is now the most urgent thing on the list,
because it is the only one a customer could ask for and not get. See the design below — it matters that this
is the same feature as `second-rooms`, priced.

- €1,000 a month, up to five gyms under one account.
- Plus at €300 stays exactly one gym.
- More than five: talk to us. Not a different feature — a different integer.

The price was €500 in the first draft, then €800, and settled at €1,000 because
that is exactly what five gyms on Base would cost — so the page can say "the
same money, with everything Plus has on all five", which a reader can check.
€800 was going to be sold as "save €200", and €200 is only true against Base
pricing, which would have meant the most expensive tier had fewer features per
gym than a single Plus account.

## 2. `second-rooms` — the card still marked `Coming`

Two locations under one account, each with its own roster and its own inbox.

It was split out of the operators card deliberately: a roster is a list on a gym
that already exists, while more than one location asks **what a gym is** in the
data. Every message, member, join code, plan, owner and colour belongs to
exactly one row of `gyms`, and twenty collection rules are written against that.

The Enterprise design below is the cheap answer to this, and the reason to
prefer it: an account that operates five gyms leaves every one of those rules
untouched, because `gyms.operators` is already a list per gym. One gym with five
rooms does not.

**Recommendation: do not build "rooms". Build Enterprise, and let the card mean
that.** Rewrite it the way the operators card was rewritten, rather than
shipping half a headline.

## 3. Stripe

The page charges €200 / €300 and a person writes the invoice. `gyms.plan` is a
text field somebody sets by hand, and `1757900000_gym_plan.js` says why: a
subscription state machine with no payments behind it is a mechanism pretending
to be a fact.

The page says "we invoice", so it is not a lie — but it is the only thing
between the landing and actually selling. Enterprise adds a third price to the
same manual process.

## 4. The gym applications queue is still hands-on

`/admin` → Applications collects a row and grants nothing: no gym, no operator,
no reach. Somebody reads it and runs the provisioning script. Deliberate — a gym
is a paying account with a member roster, not something a form conjures — but it
is manual work per customer, and Enterprise makes each one five gyms of it.

Worth automating only once the volume is real. A provisioning button that
half-works is worse than a script somebody runs on purpose.

## 5. No geography on the open door

A Plus gym reaches everybody with no gym and nothing finer, because we hold no
location for anybody. The landing says so rather than implying a segmentation
that does not exist.

Adding it means asking members for a city — a new personal field, with the
privacy conversation that goes with it. Not free, and not obviously right.

## 6. Promote the audit walks to required checks

**Done: they run in CI.** `pnpm audit:rules` (ten seconds, no browser) and
`pnpm audit:screens` (about nine minutes locally, twelve on a runner) are two
jobs on every pull request, and CI calls the same entry point a person does.

What is *not* done is adding them to branch protection. They had never run in
CI before, and a check that has passed once in a new environment is not yet a
check worth blocking a merge on — one flake and nobody can ship. `Audit the
rules` is the obvious first promotion: ten seconds, no browser, no clocks, and
it guards the collection rules that every boundary in this product rests on.

Give `Audit the screens` a few green runs first. Two of its walks wait on real
clocks, which is deliberate — a schedule tested against a mocked clock proves
the mock works — and it is where a flake would come from.

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
