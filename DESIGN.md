---
name: Forma
description: Local-first hybrid training tracker. Graphite and chalk, one cobalt signal, every number tabular.
colors:
  brand: "#1d47d6"
  brand-dark: "#6c8cff"
  bg-light: "#f2f3f5"
  bg-dark: "#0f1114"
  surface-light: "#ffffff"
  surface-dark: "#171a1f"
  ink-light: "#14161a"
  ink-dark: "#f0f2f5"
  danger: "#c2321f"
  good: "#0f7a4a"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Geist Variable, ui-sans-serif, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Geist Variable, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontVariantNumeric: "tabular-nums"
    fontWeight: 600
  label:
    fontFamily: "Geist Variable, ui-sans-serif, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Design System: Forma

## Overview

**Creative north star: "Instrument".**

Forma is a measuring device, not a motivational poster. Its promise is that it
refuses to lie about how long a goal takes, so the interface is built to look
like something calibrated: cool graphite and chalk neutrals, hairline rules, one
saturated cobalt used only where a decision is being made, and every number set
in tabular mono so columns of data never shift.

The app is used with a raised heart rate on a phone between sets, and calmly on
a desktop while planning a week. Both cases want the same thing: large legible
numbers, generous touch targets, and nothing decorative competing for attention.

**Key characteristics**

- Cool neutrals, never warm cream or beige. Off-black and off-white, never pure.
- Exactly one accent. Cobalt marks the primary action and the current selection.
- No gradients, no glows, no blurred blobs. Depth comes from hairlines and one
  tonal step between page and surface.
- Numbers are content. They get mono, tabular figures, and the largest type on
  the screen.
- Real photography carries the imagery. Nothing is invented to fill space.

## Colours

Two themes, one palette structure. Every value is a CSS custom property in
`src/index.css`; components only ever reference the semantic name.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f2f3f5` | `#0f1114` | Page ground |
| `--surface` | `#ffffff` | `#171a1f` | Panels, rail, dialogs |
| `--surface-2` | `#e8eaee` | `#1f232a` | Inset areas, thumbnails, chips |
| `--line` | `#d9dce2` | `#2a2f37` | Hairline borders and dividers |
| `--line-strong` | `#c2c7d0` | `#3a404a` | Hover borders, scrollbars |
| `--ink` | `#14161a` | `#f0f2f5` | Headings, numbers, primary text |
| `--ink-2` | `#3d434d` | `#c3c8d0` | Body text |
| `--ink-3` | `#5e646e` | `#8a919d` | Labels, secondary text |
| `--brand` | `#1d47d6` | `#6c8cff` | Primary action, selection, progression |
| `--danger` | `#c2321f` | `#ff7a6b` | Destructive actions only |
| `--good` | `#0f7a4a` | `#4ade9a` | Personal records only |

**The one-accent rule.** Cobalt means "this is the thing to press, or the thing
currently selected". It is never decoration. If a screen has two cobalt regions
that are not both actionable, one of them is wrong.

**The semantic-colour rule.** Red is destructive, green is a record. Neither is
ever used for emphasis. That is why the brand is blue: it leaves both free.

**Contrast.** Every text and accent pair is verified against WCAG AA in both
themes. Body text clears 4.5:1 on every surface it can land on, and the accent
clears 4.5:1 as text and as a fill.

## Typography

**Geist Variable** for everything, **Geist Mono Variable** for data. Both are
self-hosted through `@fontsource-variable`, so there is no render-blocking
request to a font CDN. There is no serif anywhere in this app.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | `text-3xl` | 600 | One per route |
| Section title | `text-lg` | 600 | Sits on a hairline rule |
| Body | `text-base` (0.875rem) | 400 | Capped at 58ch |
| Label | `text-2xs` (0.6875rem) | 500 | `--ink-3` |
| Data | mono, `text-lg` to `text-3xl` | 600 | Always `.num` |

**The `.num` rule.** Any figure a user compares against another figure gets the
`.num` class: mono family, tabular figures, tightened tracking. Elapsed time,
weights, reps, volume, dates, week indices. This is what stops a ticking clock
from jittering its own layout.

**No eyebrows.** There are no small uppercase labels above headings anywhere in
this app. A section's position on the page already says what it is.

## Layout

Desktop is a fixed 240px rail plus a `76rem` content column. Below `lg` the rail
becomes a 56px top bar plus a five-item bottom navigation with a safe-area inset.
Content padding is `px-4 py-6` on phones and `px-8 py-10` from `md`.

Sections stack with `gap-8`. Within a section, `gap-3` to `gap-4`. Stat rows use
a `gap-px` grid over a `--line` background, so the dividers are real hairlines
rather than borders that double up.

Full-height surfaces use `min-h-[100dvh]`, never `h-screen`.

## Shapes

One radius system, applied without exception:

- Panels, cards and dialogs: `lg` (12px)
- Controls (buttons, inputs, selects, steppers): `md` (8px)
- Small tags and thumbnails: `sm` (6px)
- Chips and pills that represent a selection: `rounded-full`

Borders are always 1px `--line`. There are no 2px borders.

## Elevation

Surfaces are flat. In light mode a panel carries a single 1px 5% shadow; in dark
mode it carries none and relies on the tonal step alone. Shadows exist only for
things that float above the page: dialogs (`--shadow-overlay`) and sticky bars
(`--shadow-raised`).

## Components

### Buttons

`primary` cobalt fill with `--brand-ink` text, `secondary` surface with a
hairline, `ghost` text-only, `danger` filled red, `dangerQuiet` red outline.
Heights: `xs` 32, `sm` 36, `md` 44 (default), `lg` 52. Anything a thumb hits
mid-session uses `md` or `lg`. Every button presses down 1px on `:active`.

### NumberField

The mid-session logging control. Two 44px steppers flank a large mono readout
that stays directly editable. Holding a stepper repeats after 380ms, so a 40kg
change is one gesture. Weight steps by 2.5, reps by 1, seconds by 5.

### Panel

`raised` (surface plus hairline plus shadow), `quiet` (hairline only), `inset`
(`--surface-2`). Panels group things that belong together. Where a hairline or
whitespace would do the job, there is no panel.

### Tag

Factual labels only: muscle group, equipment, progression rule, superset group.
Tones map to meaning, never to decoration.

### ExerciseThumb

Photography first. Every movement in the dataset ships two real photographs, so
the catalogue reads as one consistent set rather than a mix of drawings and
photos. The bundled RepDB illustration is the fallback when the photo cannot be
fetched, and a typographic three-letter muscle tile is the last resort. The tile
is rendered in CSS, so it follows the theme and ships no assets.

The detail view shows both frames, labelled start and end. A single still cannot
explain a movement.

## Motion

`MOTION_INTENSITY 4`: motion confirms state changes and nothing else.

- Colour and border transitions at 150ms.
- A logged set scales in at 180ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
- The rest countdown bar shrinks linearly over one second per tick.
- The personal-record confirmation fades in once and clears itself.

Everything above is wrapped in `useReducedMotion`, and the global reduced-motion
media query collapses all durations to zero. There are no infinite loops, no
parallax and no scroll hijacking.

## Copy

- English throughout. The free-text intake parses English and Spanish, because
  the parser has always understood both and the box should not pretend otherwise.
- The persisted domain vocabulary is Spanish (`adelgazar`, `trimestral`). It is
  never rendered raw; `src/lib/labels.ts` maps every value to a display string.
- No em-dashes. No implementation detail in the interface: no framework names,
  no storage keys, no asset counts, no version stamps.
- Plain sentences. "Rest day", not "recovery is a quiet promise".

## Do

- Do put every comparable figure in `.num`.
- Do keep touch targets at 44px or more.
- Do state what a disabled control is waiting for.
- Do test both themes before calling a screen done.

## Don't

- Don't add a second accent colour.
- Don't use red or green for anything other than destructive and record.
- Don't invent imagery for a movement that has none.
- Don't put an uppercase label above a heading.
- Don't reach for a panel when a hairline would do.
