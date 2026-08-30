---
name: enForma
description: Local-first hybrid training tracker. Chalk surfaces, floating cards, one aurora material, dot-matrix hero figures.
colors:
  brand: "#24241f"
  brand-dark: "#ecebe6"
  bg-light: "#ecebe8"
  bg-dark: "#141412"
  surface-light: "#fafaf8"
  surface-dark: "#1e1e1b"
  ink-light: "#1d1d1a"
  ink-dark: "#f2f1ed"
  aurora-green: "#3a8641"
  aurora-orange: "#cf6f1e"
  good: "#2e7038"
  danger: "#b93526"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  hero-figure:
    fontFamily: "Doto Variable, Geist Mono Variable, monospace"
    fontWeight: 700
    fontVariantNumeric: "tabular-nums"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontVariantNumeric: "tabular-nums"
    fontWeight: 600
rounded:
  pill: "9999px"
  card: "24px"
  control: "14px"
  tag: "10px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Design System: enForma

## Overview

**Creative north star: "Soft Signal".**

enForma reads like a modern health dashboard: warm chalk surfaces, borderless
cards that float on soft shadows, pill-shaped controls, and a monochrome
charcoal chrome that stays out of the way. Colour is not an accent sprinkled
around the page; it lives in exactly one material, the aurora gradient, and
that material is reserved for the hero data tiles. The one number a tile
exists to show renders in Doto, a real dot-matrix face, which is the page's
signature.

The app is still used with a raised heart rate on a phone between sets and
calmly on a desktop while planning, so nothing about the softness trades away
legibility: figures stay large and tabular, touch targets stay at 44px, and
every pairing is contrast-verified.

**Key characteristics**

- Warm chalk neutrals; graphite dark. The device picks until the member does.
- Chrome is monochrome: charcoal pills for actions and selection. No blue, no
  purple, nothing decorative.
- The aurora gradient (green to orange) appears only on hero data tiles.
- Hero figures in Doto dots; every other number in tabular Geist Mono.
- Cards have no borders. Elevation comes from soft tinted shadows.
- Photography carries the imagery. Nothing is invented to fill space.

## Colours

Two themes, one structure. Every value is a custom property in
`src/index.css`; components only reference semantic names.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#ecebe8` | `#141412` | Page ground |
| `--surface` | `#fafaf8` | `#1e1e1b` | Cards, rail pills, dialogs |
| `--surface-2` | `#e4e3df` | `#262622` | Insets, chips, thumbnails |
| `--line` | `#deddd8` | `#32322d` | Hairlines where a shadow is too much |
| `--ink` | `#1d1d1a` | `#f2f1ed` | Headings, figures |
| `--ink-2` | `#45443f` | `#c8c7c1` | Body text |
| `--ink-3` | `#64635d` | `#9b9a93` | Labels, secondary text |
| `--brand` | `#24241f` | `#ecebe6` | Primary action and selection pills |
| `--good` | `#2e7038` | `#6fce7f` | Personal records, improving trends |
| `--danger` | `#b93526` | `#ff8272` | Destructive actions, worsening trends |

**The aurora rule.** The gradient material exists in two tones, green and
orange, and carries exactly two things: a hero data tile (`AuroraTile`) and the
gym's commercial notices on Today (`FromYourGym`). Both are cases of "this is
the one thing that matters here" — the first for the member's own numbers, the
second because the gym is the paying side of this product and what it sells has
to be seen. It never decorates a button, a background or a chart, and it never
follows the member into a session.

A third, deliberate exception: a single hairline of the same material marks the
seam between the rail and the content (`rail-edge`). One pixel of the brand's
own colour drawing a boundary is not a tint on a control, so the
monochrome-chrome rule below still holds. White text on it is verified at 3:1 for the large
dot figures and 4.5:1 for supporting text against the saturated center in
both themes.

**The monochrome-chrome rule.** Buttons, active navigation and selected chips
are charcoal in light and chalk in dark. If interface chrome has a hue, it is
wrong. Green and red carry meaning only: records and improvement, destruction
and regression.

**Charts.** `--chart-1` (green) for training data, `--chart-2` (orange) for
bodyweight, neutrals for references. Area charts use a vertical gradient fill
from 30% opacity to transparent, per the shadcn chart language.

## Typography

**Geist Variable** for interface text, **Geist Mono Variable** for tabular
data, **Doto Variable** for hero figures only. There is no serif.

| Role | Face | Size | Notes |
|---|---|---|---|
| Page title | Geist 600 | `text-3xl` | One per route |
| Section title | Geist 600 | `text-lg` | On a hairline rule |
| Hero figure | Doto 700, `.num-dot` | `text-4xl` to `text-6xl` | AuroraTile, clocks, the estimate |
| Data | Geist Mono, `.num` | `text-sm` to `text-2xl` | Everything comparable |
| Label | Geist 500 | `text-2xs` | `--ink-3` |

**The `.num-dot` rule.** Doto marks the one number a surface exists to show:
the tile figures, the session clocks, the plan estimate. It never appears in
lists, tables, chips or axes; those stay in `.num` so columns align and read
fast.

**No eyebrows.** No small uppercase labels above headings anywhere.

## Shapes

One documented radius system, applied without exception:

- Buttons, chips, pills, trend badges: full (pill)
- Cards, tiles, dialogs: `xl` (24px)
- Inputs, selects, steppers: `md` (14px)
- Tags and thumbnails: `sm` (10px)

## Elevation

Cards are borderless and float on tinted shadows: `--shadow-panel` at rest,
`--shadow-tile` for the aurora tiles and hover states, `--shadow-overlay` for
dialogs. Hairlines survive only where a shadow would be noise: dividers inside
cards, quiet panels, empty-state dashes. Dark mode drops resting shadows and
relies on the tonal step.

## Widgets

### AuroraTile
The hero surface: gradient material, a label, one Doto figure, an optional
sub-line and an optional `TrendPill`. Green for training, orange for
bodyweight. With nothing to measure it says so in plain words instead of
faking a zero.

### TrendPill
"+12 kg last 30 days" on a floating pill. The arrow carries direction; colour
carries judgement only when a direction is objectively good or bad (weight
moves toward a target, volume grows). With no defensible judgement the arrow
stays neutral.

### Stat + SparkArea
A small floating tile: label, tabular figure, and a quiet gradient sparkline
with no axes and no interaction. The sparkline hides below two data points.

### Charts
Recharts through the shadcn chart wrapper: gradient area charts with hairline
grids, unit-labelled axes, and pill tooltips. Weekly volume, estimated 1RM and
bodyweight (with the plan's target as a dashed reference line). Chart
animations stay off; they ignore reduced-motion preferences and add nothing.

### NumberField
Unchanged mid-session logging control: two 44px steppers around a large
tabular readout, hold to repeat.

## Layout

Desktop: a 240px rail of pill items on the page ground plus a `120rem` content
column, padded `lg:px-10`. The public landing wears the same rail and the same
measure, and pulls in to `82rem` for the sections you read rather than scan. Below `lg`: a chalk top bar and a five-item bottom nav where the
active item is a charcoal pill. Sections stack with `gap-8`; metric grids use
`gap-4` between floating tiles. Full-height surfaces use `min-h-[100dvh]`.

## Motion

Motion confirms state and nothing else: 150ms colour transitions, a 180ms
scale-in on a logged set, the rest countdown draining linearly, buttons
pressing down 1px. Everything respects `prefers-reduced-motion`. No parallax,
no scroll effects, no chart draw-ins.

## Theme

The device decides until the member does. With no stored choice the theme
follows `prefers-color-scheme` and keeps following it, so a machine that turns
dark at sunset takes the app with it. The toggle writes a choice and a written
choice wins from then on. Both themes keep hierarchy, the aurora material and
AA contrast intact.

The resolution happens twice and the two must agree: an inline script in
`index.html` settles it before first paint so nothing flashes, and
`src/hooks/use-theme.ts` owns it from there.

## What the gym pays for

Members are given the training and the eating; gyms pay the bills. So anything
a gym publishes outranks the equivalent thing the app generates, in the same
slot rather than in a new one:

- Today's food slot shows the gym's kitchen card, with prices, whenever there
  is one. The public recipe of the day drops below it and is never removed.
- `FromYourGym` sits directly under the day's training and carries at most two
  cards: the soonest event still ahead, and one commercial card — the newest
  live offer or fresh shop item, whichever came last.
- With no gym attached, that same slot asks for one, once, and can be waved off
  for good.

The restraint is the point. Nothing interrupts, nothing blocks, everything is
dismissible, and none of it enters a live session, where the screen has one
job. An app that becomes a hoarding loses the audience the gym is paying to
reach.

## Copy

English throughout, plain sentences, no em-dashes, no implementation detail on
screen. The persisted Spanish domain vocabulary is mapped to display strings in
`src/lib/labels.ts` and never rendered raw.

Two nouns, never mixed: a **programme** is designed (by the coach or the
standard generator) and carries a dated calendar; a **plan** is the editable
week that repeats in the planner. The intent "go design a programme" is always
labelled "Design my programme", on every surface.

## Do

- Do reserve the aurora material for hero data tiles.
- Do put every comparable figure in `.num` and only hero figures in `.num-dot`.
- Do keep touch targets at 44px or more.
- Do test both themes before calling a screen done.

## Don't

- Don't add a hue to chrome. Charcoal and chalk only.
- Don't put borders on floating cards.
- Don't use Doto for lists, tables or axes.
- Don't fake a figure when there is nothing to measure; say so instead.
- Don't animate charts.
