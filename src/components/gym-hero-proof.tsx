import { memo, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Barbell,
  CalendarBlank,
  ForkKnife,
  type Icon,
  Megaphone,
  Receipt,
  Stack,
  Storefront,
  Trophy,
} from '@phosphor-icons/react'
import { TEMPLATE_LABELS, type TemplateKind } from '@/lib/messages'
import { REACH_WINDOW_DAYS } from '@/lib/gym-reach'
import { Panel } from '@/ui/Panel'
import { cn } from '@/lib/utils'

/**
 * The hero's right-hand column: the case for paying, in three beats.
 *
 * It was four figures of identical size stacked in a box — 2,076 movements, 8
 * templates, 30 days, 0 readable — which read as a specification rather than an
 * argument. Two problems, and only one of them was visual.
 *
 * The first is that the four facts are not equal. "Zero of their training you
 * or we can read" is the only line no competitor can write, and it sat at the
 * bottom in the same weight as a feature count. It leads now, inverted and
 * enormous, which is a strange thing for a sales panel to open with — the thing
 * you cannot have — and that is exactly why it stops a reader.
 *
 * The second is that "8 kinds of message" is an assertion where it could be a
 * demonstration: the templates have names, and naming them one at a time is
 * both more concrete and the only live thing on the page.
 *
 * Every figure is still counted from the product — the template count comes off
 * the map the composer renders — because a page whose own pitch is "counted,
 * not estimated" cannot carry an invented number.
 *
 * Two colours, each meaning one party. Orange (`--accent-gym`) marks the half a
 * gym gets to touch: the templates, the tick that says which one is showing.
 * Green (`--accent-member`) marks the half that is the member's: the seal, and
 * the library they already have for nothing. They never share an element, so
 * the page can be read by colour alone — orange is what you send, green is what
 * is theirs.
 */

/** One per template, in the order `TEMPLATE_LABELS` declares them. */
const TEMPLATE_ICONS: Record<TemplateKind, Icon> = {
  announcement: Megaphone,
  event: CalendarBlank,
  menu: ForkKnife,
  offer: Receipt,
  challenge: Trophy,
  collection: Stack,
  product: Storefront,
  programme: Barbell,
}

const TEMPLATES = Object.entries(TEMPLATE_LABELS) as [TemplateKind, string][]

/**
 * The templates, named one at a time.
 *
 * Isolated and memoised so its timer never re-renders the hero around it, and
 * static under `prefers-reduced-motion` — where the honest fallback is the same
 * information at rest rather than a lesser version of it.
 */
const TemplateCycle = memo(function TemplateCycle() {
  const reduceMotion = useReducedMotion()
  const [i, setI] = useState(0)

  useEffect(() => {
    if (reduceMotion) return
    const id = window.setInterval(() => setI((n) => (n + 1) % TEMPLATES.length), 2400)
    return () => window.clearInterval(id)
  }, [reduceMotion])

  if (reduceMotion) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {TEMPLATES.map(([kind, label]) => {
          const Glyph = TEMPLATE_ICONS[kind]
          return (
            <li
              key={kind}
              className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-2xs text-ink-2"
            >
              <Glyph size={13} weight="regular" className="shrink-0 text-accent-gym" />
              {label}
            </li>
          )
        })}
      </ul>
    )
  }

  const [kind, label] = TEMPLATES[i]
  const Glyph = TEMPLATE_ICONS[kind]
  return (
    <div className="flex flex-col gap-2.5">
      {/* Fixed height, so the panel does not breathe once every two seconds as
          "Offer" gives way to "Daily menu". */}
      <div className="relative h-14 overflow-hidden rounded-lg bg-surface-2">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={kind}
            /* Opacity leads, position follows.
               Two attempts got this wrong in opposite directions: a short
               travel on a slow spring left both labels legible at once, which
               reads as a rendering fault; a long travel with a fast exit left
               the box empty between them, which reads as a broken component.
               A quick fade with a small slide has neither — the outgoing label
               is gone before it can compete, and the incoming one is there
               before the box can look empty. */
            initial={{ y: 22, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ y: -22, opacity: 0, transition: { duration: 0.14, ease: 'easeIn' } }}
            className="absolute inset-0 flex items-center gap-3 px-3"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent-gym-soft">
              <Glyph size={17} weight="regular" className="text-accent-gym" />
            </span>
            <span className="min-w-0 truncate text-base text-ink">{label}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Eight ticks: the count and the position in one mark, so the number in
          the line below has something to point at. */}
      <div className="flex gap-1" aria-hidden>
        {TEMPLATES.map(([k], n) => (
          <span
            key={k}
            className={cn(
              'h-0.5 flex-1 rounded-full transition-colors duration-500',
              n === i ? 'bg-accent-gym' : 'bg-line-strong',
            )}
          />
        ))}
      </div>
    </div>
  )
})

export function GymHeroProof({ libraryFigure }: { libraryFigure: string }) {
  return (
    <Panel padding="none" className="flex w-full flex-col overflow-hidden">
      {/* 1. The seal, first and inverted. `--brand` flips with the theme — near
             black on the light page, near white on the dark one — so this is a
             hard tonal cut either way, using the palette the app already has
             rather than a colour invented for a landing page. */}
      <div className="relative flex items-start gap-5 bg-brand px-5 py-6 text-brand-ink md:px-6">
        {/* The member's colour, on the member's half. Sits on the inverted
            block where both themes give it room. */}
        <span
          className="absolute top-0 left-0 h-full w-1 bg-accent-member"
          aria-hidden
        />
        {/* `.num`, not the page's dot-matrix `.num-dot`. That face is the
            signature and it holds up for "2,076" — but a lone zero in it is a
            sparse ring of dots that reads as a spinner rather than a digit.
            Geist Mono's slashed zero is unmistakable at a glance, and looks
            like what the sentence is about. */}
        <span className="num shrink-0 text-7xl leading-[0.85] tracking-tight">0</span>
        <span className="flex flex-col gap-1.5 pt-1">
          <span className="text-base leading-snug font-medium">
            of their training is readable.
            <br />
            Not by you. Not by us.
          </span>
          <span className="text-2xs leading-relaxed opacity-70">
            It is encrypted on their own device. Which is why they keep the app.
          </span>
        </span>
      </div>

      {/* 2. What a gym gets to put in front of that — the live beat. */}
      <div className="flex flex-col gap-3.5 px-5 py-6 md:px-6">
        <span className="flex items-center gap-2 text-2xs font-medium tracking-wide text-ink-3 uppercase">
          <span className="size-1.5 shrink-0 rounded-full bg-accent-gym" aria-hidden />
          And this is what goes in it
        </span>
        <TemplateCycle />
        <p className="text-2xs leading-relaxed text-ink-3">
          {/* Emphasised by weight, not by the accent. Measured: `--chart-2` on
              the light panel is 3.04:1, which is fine for a tick or an icon and
              short of the 4.5:1 that 11px text needs. So the colour stays on
              the marks and the words stay legible. */}
          <span className="num font-medium text-ink">{TEMPLATES.length}</span> kinds of message, and
          the opens, replies and reservations counted for{' '}
          <span className="num font-medium text-ink">{REACH_WINDOW_DAYS}</span> days. Counted, not
          estimated.
        </p>
      </div>

      {/* 3. The base they already have, as the footnote it is: it explains why
             there is any attention here to sell, and costs the gym nothing. */}
      <div className="flex items-baseline gap-3 border-t-2 border-accent-member bg-surface-2 px-5 py-4 md:px-6">
        <span className="num-dot shrink-0 text-xl leading-none text-ink">{libraryFigure}</span>
        <span className="text-2xs leading-relaxed text-ink-3">
          movements, the planner and the history: free, already on their phone
        </span>
      </div>
    </Panel>
  )
}
