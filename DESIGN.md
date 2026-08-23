---
name: Forma
description: Hybrid calisthenics + gym, local-first, Noir Warm editorial with 3D plate.
colors:
  amber: "#d98e3f"
  amber-deep: "#c07a2e"
  amber-soft: "#d98e3f14"
  noir: "#1a1816"
  noir-2: "#1f1d1b"
  card: "#26231f"
  card-hover: "#2e2a26"
  line: "#3a3632"
  line-strong: "#4a4642"
  ink: "#f5ede4"
  ink-soft: "#e8e0d8"
  muted: "#b8afa6"
typography:
  display:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "clamp(1.8rem, 4vw, 2.4rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Instrument Serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Inter, ui-sans-serif, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, ui-sans-serif, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "18px"
  xl: "22px"
  2xl: "28px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.noir}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.amber-deep}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.noir}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  badge:
    backgroundColor: "{colors.noir-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
---

# Design System: Forma

## Overview

**Creative North Star: "Noir Warm Plate"**

Forma is a warm editorial tool for cold iron. Hybrid calisthenics + barbell, local-first, offline — it treats training as a quiet, human ritual rather than a neon dashboard. The amber plate (3D sphere with soft shadow) is the signature: a single warm object on a noir field, blurred orbs behind, grain subtle. Density is calm on desktop (sidebar + 7xl grid, generous whitespace) and compact on phone (bottom nav, 44px touch). Motion is restrained: 200ms ease for state, no layout thrash.

**Key Characteristics:**
- Warm dark, not cold dark — stone text on noir, amber as only warm accent
- Editorial serif (Instrument) for display, Inter for UI, mono for data
- 3D plate hero/orb/plate illustrations, no stock gym photos
- Desktop-first sidebar + topbar, mobile drawer + bottom nav fallback removed

## Colors

Warm dark editorial. One warm accent, one ink, one muted — rest is tonal layering.

### Primary
- **Amber** (#d98e3f / oklch): Primary action, active nav dot, PR badge, rest timer, progression. Used on ≤10% of any screen.

### Neutral
- **Noir** (#1a1816): Background, radial gradients #2a2520 + #2e2216
- **Noir 2** (#1f1d1b): Surface 2, muted card
- **Card** (#26231f): Card background, sidebar
- **Line** (#3a3632): Border, divider
- **Line Strong** (#4a4642): Hover border
- **Ink** (#f5ede4): Headings, primary text
- **Ink Soft** (#e8e0d8): Body text
- **Muted** (#b8afa6): Secondary text, labels

**The Amber Rarity Rule.** Amber appears only for primary CTA, active state, PR, and rest. Its rarity is the point — if everything is amber, nothing is.

**The Warm Not Neon Rule.** No pure white, no neon cyan. Warm stone on noir, never #fff on #000.

## Typography

**Display Font:** Instrument Serif (with Georgia) — warm, editorial, for h1–h3
**Body Font:** Inter (with ui-sans-serif) — neutral, for UI and data
**Label/Mono Font:** JetBrains Mono — for dates, kg×reps, tabular data

**Character:** Serif for story, sans for system, mono for data. Serif never for buttons or labels.

### Hierarchy
- **Display** (400, clamp 1.8–2.4rem, 1.1): PageHeader title, hero
- **Headline** (400, 1.5rem, 1.2): Card titles, day labels (MON)
- **Title** (600, 1.125rem, 1.4): Section titles
- **Body** (400, 0.875rem, 1.6): Descriptions, max 65ch
- **Label** (500, 0.75rem, 1.4, 0.08em uppercase): Eyebrow, field labels, badges

**The Serif For Story Rule.** Instrument Serif only for display/headline. Buttons, inputs, badges stay Inter.

## Layout

Desktop-first. Sidebar 16rem (icon 3rem when collapsed) + SidebarInset `max-w-7xl` centered. Header 56px sticky with backdrop-blur, `bg-background/80`. Main `p-4 md:p-6 lg:p-8` with `pb-28` for mobile safe-area. Grid: Today 2-col, Planner 7 days `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, Library `grid-cols-1 lg:grid-cols-2`. Spacing rhythm 8/12/16/24/32.

## Elevation & Depth

Flat with tonal layering, not lifted shadows. Depth comes from warm tonal steps (surface → surface-2 → card) and one soft shadow.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgba(0,0,0,.35), 0 8px 24px rgba(0,0,0,.35)`): Cards at rest
- **Soft** (`0 4px 24px rgba(0,0,0,.25)`): Hover orbs

**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only for cards and hover orbs, never for inputs or nav.

## Shapes

Gently curved, not pill nor sharp. Radius 10/14/18/22/28, always warm. Cards `lg` (18px), inputs/buttons `md` (14px), badges `sm` (10px) pill `rounded-full`, sidebar `inset` variant `xl`. Borders 1px `line`, never 2px.

## Components

### Buttons
- **Shape:** `md` (14px), `h-8` default, `h-9` lg, `h-7` sm
- **Primary:** `bg-amber` `#d98e3f` + `text-noir` `#1a1816`, `hover:bg-amber-deep`
- **Hover / Focus:** 200ms ease, `focus-visible:ring-ring` 3px amber/50, `active:translate-y-px`
- **Secondary / Ghost:** Secondary `bg-card` hover `bg-card-hover`, Ghost `hover:bg-muted/50`

### Chips (Filter)
- **Style:** `rounded-full` `border` `px-4 py-2.5` `text-xs` `min-h-11`
- **State:** Unselected `border-line bg-card text-muted`, Selected `border-amber bg-amber text-noir`

### Cards / Containers
- **Corner Style:** `lg` 18px
- **Background:** `card` `#26231f`
- **Shadow Strategy:** Card shadow, flat otherwise
- **Border:** `1px line` `#3a3632`
- **Internal Padding:** `p-4` md, `p-3` sm, `p-5` lg

### Inputs / Fields
- **Style:** `bg-surface` `#1a1816` `border-line` `rounded-md` `px-4 py-3` `text-sm`
- **Focus:** `border-accent` amber + `bg-surface-2`
- **Error / Disabled:** `opacity-40` `cursor-not-allowed`

### Navigation
- **Sidebar:** `variant=inset` `collapsible=icon`, `16rem` / `3rem` icon, `bg-sidebar` `#1f1d1b`, `border-r` line, `Tooltip` on collapsed, `SidebarTrigger` in header, mobile `Sheet` drawer. Active `isActive` → `bg-sidebar-accent` amber soft.

## Do's and Don'ts

### Do:
- **Do** use amber on ≤10% of screen — primary CTA, active dot, PR, rest timer.
- **Do** keep line length ≤65ch (`max-w-[52ch]` for descriptions).
- **Do** use `ScrollArea` for horizontal chip rows, not `overflow-x-auto` raw.
- **Do** lazy `Today`/`Planner` etc. via `React.lazy` + `Skeleton h-64`.
- **Do** keep touch targets ≥44px (`min-h-11` `h-11`).

### Don't:
- **Don't** use `text-zinc-*` — use `text-ink`/`text-muted`/`text-ink-soft`.
- **Don't** put `max-w-3xl` on desktop — use `max-w-7xl` + grid.
- **Don't** use bottom nav on desktop — sidebar is primary.
- **Don't** add neon or pure white — stay warm noir.
- **Don't** invent new radius — use 10/14/18/22/28.
