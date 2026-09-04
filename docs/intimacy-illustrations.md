# Illustrations for the intimate activity module

The brief, written before anybody is commissioned, so that quotes are
comparable and the first delivered file drops straight in.

The code is ready for them: every entry in `src/data/intimacy.ts` carries an
`art` field that is `null` today, `src/components/intimacy-art.tsx` draws the
frame at the right shape whether or not a file exists, and `public/intimacy/`
is where the files go. Adding the first one is a file plus four lines.

## What is being drawn

Sixteen illustrations, one per entry in `INTIMATE_ACTIVITIES`. Each shows how
two adults are arranged: the posture, what is supporting what, and where the
weight is. They sit beside a paragraph that already describes the arrangement
in words, so the drawing carries the geometry rather than the explanation.

## Drawings, not photographs. This is not negotiable

Photographs of real people in sexual positions are adult content under
Stripe's restricted-business terms, and this product bills through Stripe on
an account shared with another business. Illustrations of the same
arrangements, in the register of a physiotherapy handout, are wellness
education and are not. Commissioning photography would mean moving the whole
company to an adult-friendly processor at roughly four times the fee, which
is priced in `docs/plans/2026-09-03-life-plan-v2.md`.

## Style

- Flat vector, two figures, no faces or faces reduced to a single line. The
  point is the arrangement, not the people.
- Anatomical rather than erotic. Nothing explicit is depicted; the framing is
  the same one a clinician's leaflet uses.
- Neutral, non-specific bodies. Vary body size and skin tone across the set
  rather than drawing sixteen of the same couple. Nothing that reads as a
  particular gender pairing where the arrangement does not require one.
- Two flat tones plus one accent, working on both a light `#ecebe8` and a dark
  `#141412` background. Either supply one drawing that works on both, or two
  files and we will pick per theme.
- Where a prop matters to the entry (a pillow under the hips, a chair with a
  back, forearms rather than hands), the prop has to be visible. That detail
  is the useful part of the entry and the reason for the drawing.

## Files

| Property | Value |
|---|---|
| Format | WebP, quality 82 or better |
| Size | 1200 x 900 px (4:3, matching `ART_ASPECT`) |
| Weight | under 60 kB each |
| Name | `<id>.webp`, the id from `INTIMATE_ACTIVITIES` |
| Location | `public/intimacy/` |

Source files (SVG or the native format) delivered alongside, so a colour or a
prop can be corrected without a re-commission.

## What has to come with each one

Filled into the entry's `art` field:

- `file` — the file name.
- `alt` — one sentence describing the drawing for somebody who cannot see it.
  Written by whoever draws it, describing the picture, not the arrangement.
  The paragraph beside it already does the arrangement.
- `credit` — the name to print in `ATTRIBUTION.md` and in Settings → About.
- `licence` — what we may do with it. For commissioned work this is the
  wording from the contract.

## The licence to ask for

Buy the copyright outright, or an exclusive perpetual worldwide licence with
the right to sub-licence, covering print and screen. A stock or
non-exclusive licence is cheaper and is the wrong shape here: these appear in
a paid product, they are specific to entries we wrote, and a licence that
lapses or that a competitor can also buy is a re-commission waiting to
happen.

## Ways to get them made, in rough order of cost

Nothing has been ordered. This list is what to price, not a recommendation.

1. **One illustrator, sixteen drawings, fixed fee.** Cheapest per drawing and
   the only route that gives one consistent hand across the set. Ask for a
   sample of two before the rest.
2. **A generative model, then an illustrator to correct and unify.** Most
   image APIs forbid sexual content in their terms even for non-explicit
   anatomical work, so this has to be checked vendor by vendor in writing
   before it is a plan. If it is allowed, the model does the rough and a
   person makes the set coherent and the props correct.
3. **Licensing an existing medical or wellness illustration set.** Likely to
   cover a fraction of the sixteen arrangements, and the ones it covers will
   not match the others in style.

Whatever the route, the acceptance test is the same: hold each drawing beside
its entry and check the prop, the weight-bearing limb and the posture agree
with the words.
