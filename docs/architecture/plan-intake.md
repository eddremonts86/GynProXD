# How a sentence becomes a programme

What runs where, what leaves the device, and which model answers — for the path
that turns "voy a empezar 1 mes en casa y luego al gyn a darle con todo" into
twelve weeks of training.

## Three passes, and why it is three

```
  what you type
       │
       ├─ 1. parse ──────── instant, offline, no model    → fills the form
       │
       ├─ 2. refine ─────── seconds, a small model        → fixes the fields   [seam, not built]
       │
       └─ 3. design ─────── a minute or two, the coach    → builds the blocks
```

They are separate because they answer to different clocks and different
failures, not because three is a nice number.

**Pass 1 — `src/lib/onboarding-parse.ts`.** Regular expressions, bilingual, 200
lines. No network, no model, no waiting. Its whole job is to put something on the
screen for you to check while pass 3 thinks.

It is not smart and is not trying to be. It cannot read a sequence, an idiom or a
typo, and the review step exists because of that: every field carries a
`provenance` of `quoted` (matched literally) or `inferred` (a decision this file
made), and `confidence` counts an inference as half a quote. Before that,
confidence was coverage — the placeholder this app ships in the textarea scored
**1.0** while reading "3 times a week for 2 hours" as 120 minutes per session and
the word "gym" as a barbell-only pool.

**Pass 2 — the seam.** Not built. A small model re-reading the same sentence
would fix what patterns cannot: `gyn` for `gym`, "peso 92 kilos", "quiero
ponerme fuerte", and unit ambiguity. It has to be a *separate* pass rather than
folded into the coach because the form must be fillable in seconds and the coach
is not.

**Pass 3 — `designWithCoach` in `src/lib/ai-plan.ts`.** The programme itself:
the split, the movements, the progression, and now the phasing. It receives the
whole prose and can act on it.

## Why the prose has to travel

`OnboardingInput` has **one** `equipment` and **one** `effort`. Scalars. A
sentence with a "then" in it describes two programmes, and no extraction — not a
regex, not a perfect model — has anywhere to put the second one.

The output model does. A programme is
`blocks[Math.floor(week / 4) % blocks.length]`, so a block is a month, and
"the first month at home, then the gym" maps onto block 1 and blocks 2..n exactly.
The shape existed on the way out and not on the way in.

So `constraints` carries the sentence verbatim into the prompt — not the residue
the patterns failed to eat, all of it — and the prompt tells the coach it may
build the change into the blocks. That channel is also the only one that can
carry an injury: "cuidado con la rodilla izquierda" has no field, and before this
it reached nothing.

## What leaves the device

This matters more here than in most apps, because the landing page says *"It runs
on this device"* and *"nothing leaves this device unless you turn on sync"*.

| | leaves the device | when |
|---|---|---|
| Training rows, weigh-ins, profile | encrypted, unreadable by the server | only with sync on |
| The structured intake (age, goal, days) | yes, in the prompt | on every design |
| **The free text, verbatim** | **yes, in the prompt** | **on every design** |

That last row is a change in kind, not degree. The box is where somebody writes
about an injury, and an injury is health data. It is the strongest argument for
pass 2 running locally, and a reason to keep the coach's prompt to what it needs.

## Which model answers, and where

```
browser ──POST /api/minimax/chat/completions──► nginx (prod) / vite proxy (dev)
                                                  │
                                                  ▼
                                          the sync server
                                    pb_hooks/shared_fetches.pb.js
                                       adds MINIMAX_API_KEY
                                                  │
                                                  ▼
                                            the provider
```

The key never reaches the browser, which is right. Everything else about this is
configurable except the one thing that should be.

**Today, in production:** `MiniMax-Text-01`, and `GET /api/enforma/capabilities`
answers `{"coach":true}` when a key is present. `MINIMAX_API_KEY` and
`MINIMAX_BASE_URL` live on the **sync** service in Coolify, not on the app.

**The asymmetry to fix.** The key is read at runtime by the hook; the *model name*
is baked into the browser bundle at build time — `__AI_COACH_MODEL__` in
`vite.config.ts`, from `MINIMAX_MODEL`, which is not set on the app service and
so falls back to the default. **Changing models therefore needs a rebuild, while
changing keys does not.** Moving the model name to the hook beside the key makes
trying another one an environment variable instead of a deploy.

### Pointing it somewhere else

Because the app only knows a path, the provider is a server-side decision:

| target | what changes | who it works for |
|---|---|---|
| MiniMax (today) | nothing | everyone |
| Another hosted model | `MINIMAX_BASE_URL` + key, and the model name once it is runtime | everyone |
| **Ollama on this machine** | point the dev proxy at `http://localhost:11434/v1` | the developer, and self-hosters |
| **In the browser (WebGPU)** | a different app | everyone, at the cost of gigabytes in a PWA whose point is being small |

"Local" is a deployment choice, not an app change — as long as pass 2 is built
against the path and not against a vendor.

A note on size, from measuring rather than hoping: a 3B instruct model
(`qwen2.5:3b-instruct`, which this machine has) is fine for pass 2 — typos,
units, Spanish. It is not fine for pass 3. Reading a phased sentence and turning
it into block metadata is reasoning, and a small model will produce confident
nonsense rather than admit it.

## What the coach is asked for, and what is checked

The prompt asks for blocks of `{ label, place, intensity, days }`.
`validateBlocks` refuses the lot rather than repairing it — a half-hallucinated
week is worse than the deterministic fallback.

Checked on the way in: movement ids exist and are allowed; a day has at least
three and at most eight; day names are real and unique; the block count matches;
`progression`, `supersetGroup`, `timed` and `unilateral` are coerced to legal
values; `label` is trimmed to 28 characters; `place` and `intensity` are ignored
unless they are values the intake itself offers.

**The rule worth remembering:** a block's `place` intersects the programme's pool
and never replaces it. A block may narrow, never widen. Authorisation to use a
gym comes from the member's own words — the intake answering `hibrido` when it
reads two places in one sentence — and the block only chooses within it.

## When it fails

`buildProgramme` falls back to the deterministic designer in
`plan-generator.ts` on a timeout, a non-200, unparseable JSON, or a structure
that fails validation. That designer varies movements per block and **does not
phase**: it is the fallback for a coach that did not answer, and inventing a
periodisation nobody asked for is the wrong kind of initiative.

Which means a phased programme is a coach feature. When the coach declines you
get a correct programme that ignores the "then" in your sentence — and the
header says `Standard template`, so it is visible rather than silent.

## Where the numbers stay

Timelines, safe rates and weight checkpoints are computed in `plan-estimate.ts`
and are never sent for an opinion. The prompt says so out loud: *"Weight pace is
fixed at N kg/week by a separate calculation. Do not mention or change it."*

That line is the product's promise — *"the estimate it gives you is arithmetic
you can check"* — expressed as a constraint on the model. The coach chooses
movements. It does not get a vote on how long anything takes.
