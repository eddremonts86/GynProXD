import { useCallback, useEffect, useState } from 'react'
import { CATALOGUE_SIZE } from '@/data/catalogue-stats'
import { WGER_SIZE } from '@/data/wger-stats'
import { useReducedMotion } from 'motion/react'
import {
  ArrowDown,
  ArrowRight,
  Barbell,
  CalendarBlank,
  ChartLineUp,
  ForkKnife,
  Gauge,
  ListMagnifyingGlass,
  LockKey,
  Megaphone,
  PencilSimpleLine,
  Timer,
  Trophy,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { AuthPanel } from '@/components/auth-panel'
import { AuroraTile } from '@/ui/AuroraTile'
import { Mark } from '@/components/brand'
import { RailToggle } from '@/components/rail-toggle'
import { useRailHidden } from '@/hooks/use-rail'
import {
  AuroraWash,
  Body,
  Label,
  LandingRail,
  Lead,
  MobileBar,
  READ,
  Reveal,
  SectionHeading,
  SHELL,
  type LandingSection,
} from '@/components/landing-kit'
import { Button } from '@/ui/Button'
import { cn } from '@/lib/utils'

/**
 * The public face of enForma, shown to anyone without an open profile.
 *
 * The brief asked for a marketing page whose hero carries the sign-in form in a
 * side panel, with a second way into that form further down. Both panels are
 * real, independent mounts of `AuthPanel` rather than one form and one link, so
 * whichever you reach first is the one that opens the app.
 *
 * It wears the app's own chrome: the same 240px rail and the same content
 * measure, so the page and the product line up edge to edge instead of stepping
 * in width at the door. The rail is not decoration — the visitor sees the shape
 * of the thing they are signing in to.
 *
 * Two house rules shape the rest. Nothing decorative stands in for a
 * photograph: the only pictures are the movement illustrations the library
 * already ships. And no figure here is invented — the timeline and every
 * milestone are what `estimatePlan` actually returns for the profile named
 * beside them.
 */

/* Two measures, and neither is the app shell's.
   
   The shell caps at 120rem because a dashboard has dense grids that eat the
   width. This page has a headline and a form: at 2056px the hero was 1816px
   wide, the estimate pair stretched to 1224px, and the headline died 600px
   short of its own column. Copying the product's cap made the front door look
   abandoned rather than spacious.
   
   So the landing takes a measure of its own. `SHELL` is what a marketing page
   can hold; `READ` pulls in further for the sections you read rather than
   scan. Below roughly 1500px they resolve to the same thing and the difference
   never arises. */
const SECTIONS: LandingSection[] = [
  { id: 'top', label: 'Overview', icon: Gauge },
  { id: 'estimate', label: 'How it plans', icon: CalendarBlank },
  { id: 'inside', label: "What's inside", icon: ListMagnifyingGlass },
  { id: 'library', label: 'Movements', icon: Barbell },
  { id: 'session', label: 'In the gym', icon: Timer },
  { id: 'privacy', label: 'Local or synced', icon: LockKey },
]

/**
 * The mark blown up to architectural scale: four rules of decreasing length,
 * read as a measuring scale. It carries no information, so it is hidden from
 * assistive tech and never intercepts a pointer.
 */
function ScaleGround({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('pointer-events-none absolute flex flex-col gap-[3vw]', className)}
    >
      {[100, 74, 48, 22].map((width, i) => (
        <span
          key={width}
          className="h-[1.1vw] rounded-full bg-ink"
          style={{ width: `${width}%`, opacity: 0.05 - i * 0.008 }}
        />
      ))}
    </span>
  )
}

/* Real illustrations for real movements, at the size the app shows them. */
const MOVEMENTS: { file: string; name: string }[] = [
  { file: 'barbell-row-peak', name: 'Barbell row' },
  { file: 'archer-pull-ups-peak', name: 'Archer pull-ups' },
  { file: 'banded-squat-peak', name: 'Banded squat' },
  { file: 'bench-dips-peak', name: 'Bench dips' },
  { file: 'banded-romanian-deadlift-peak', name: 'Romanian deadlift' },
  { file: 'ab-wheel-rollout-peak', name: 'Ab wheel rollout' },
  { file: 'archer-push-ups-peak', name: 'Archer push-ups' },
  { file: 'assisted-pull-ups-peak', name: 'Assisted pull-ups' },
]

/* wger's movements are browsable like any other, so the figure on the front
   door counts them. They are kept out of the generated programmes — see
   lib/exercises.ts — but this number answers "how much is in there". */
const LIBRARY_SIZE = (CATALOGUE_SIZE + WGER_SIZE).toLocaleString('en')

/* Properties of the build, not claims about users. */
const FACTS: { figure: string; unit?: string; label: string }[] = [
  { figure: LIBRARY_SIZE, label: 'movements in the library' },
  { figure: '0', label: 'accounts needed to train' },
  { figure: '2–6', unit: 'days', label: 'a week, split to fit' },
  { figure: '4th', unit: 'week', label: 'is a deload, every time' },
]

/* Every entry is a screen that exists, described in its own words. */
const INSIDE: { icon: Icon; title: string; body: string }[] = [
  {
    icon: PencilSimpleLine,
    title: 'Programme designer',
    body: 'Six answers become a dated calendar with blocks, deloads and a timeline it will defend.',
  },
  {
    icon: CalendarBlank,
    title: 'Weekly planner',
    body: 'Lay out the week once. Today reads from it every morning.',
  },
  {
    icon: Barbell,
    title: 'Guided session',
    body: 'The day preloads, sets log against big steppers, the rest clock runs at 90 seconds.',
  },
  {
    icon: ListMagnifyingGlass,
    title: 'Movement library',
    body: `${LIBRARY_SIZE} movements filtered by muscle and by the equipment you can reach today.`,
  },
  {
    icon: ChartLineUp,
    title: 'History',
    body: 'Every finished session, and what it added up to: volume, estimated 1RM, bodyweight.',
  },
  {
    icon: Trophy,
    title: 'Thirty-day challenges',
    body: 'One movement, thirty days, a number per day. Progress stays private to the profile.',
  },
  {
    icon: Gauge,
    title: 'Placement test',
    body: 'Three 60-second stations place you on two axes, strength and cardio, in five minutes.',
  },
  {
    icon: ForkKnife,
    title: 'Recipes and the day plate',
    body: 'A searchable catalogue, with portions worked out for the day you actually planned.',
  },
  {
    icon: Megaphone,
    title: 'Gym broadcasts',
    body: 'Events, menus, offers and challenges from the gym you train at, if you train at one.',
  },
]

/* What the estimator returns for the profile in the caption: 0.70 kg a week
   off 140 kg, sampled at the weeks the milestone list would show. */
const MILESTONES: { week: string; weight: string; note: string }[] = [
  { week: '4', weight: '137.2', note: 'first deload' },
  { week: '12', weight: '131.6', note: 'quarter' },
  { week: '24', weight: '123.2', note: 'half year' },
  { week: '48', weight: '106.4', note: 'year' },
  { week: '86', weight: '80.0', note: 'target' },
]

/**
 * The landing reads at arm's length, not mid-set, so it steps up out of the
 * app's 14px chrome: 18px for a lead, 14px for supporting copy, 12px for a
 * label. The app's `text-2xs` is a label size and is never body text here — a
 * 48px headline falling straight to 11px has nothing in between.
 */
/**
 * The page's one moment of colour, and it is earned: the aurora material is
 * reserved by the design system for hero data tiles, and this is the hero's
 * data. The figure is what `estimatePlan` returns for the profile beside it,
 * and the panel next to it shows every step that produced it, because the
 * product's whole claim is that it does the arithmetic in the open.
 */
function EstimateReadout({ className }: { className?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2', className)}>
      <AuroraTile
        tone="green"
        label="Realistic timeline"
        value="20"
        unit="months"
        sub="140 kg to 80 kg at a safe 0.70 kg a week"
      />

      <figure className="flex min-h-44 flex-col justify-between gap-5 rounded-xl bg-surface p-6 shadow-[var(--shadow-panel)]">
        <figcaption className="text-sm font-medium text-ink">Every step, on screen</figcaption>
        <dl className="num flex flex-col gap-2 text-base">
          {[
            { expression: '140 \u2212 80', result: '60 kg' },
            { expression: '60 \u00f7 0.70', result: '86 weeks' },
            { expression: '86 \u00f7 4.3', result: '20 months', total: true },
          ].map((row) => (
            <div
              key={row.expression}
              className={cn(
                'flex items-baseline justify-between gap-4',
                row.total && 'border-t border-line pt-2',
              )}
            >
              <dt className="text-ink-3">{row.expression}</dt>
              <dd className={row.total ? 'font-semibold text-ink' : 'text-ink-2'}>{row.result}</dd>
            </div>
          ))}
        </dl>
        <p className="text-base leading-relaxed text-ink-3">
          Ask for one month and it will still say twenty.
        </p>
      </figure>
    </div>
  )
}

/** The milestone ladder the estimate produces, every fourth week, sampled. */
function MilestoneLadder({ className }: { className?: string }) {
  return (
    <figure className={cn('flex flex-col', className)}>
      <figcaption className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
        <Label>Milestones on the same plan</Label>
        <Label className="num">kg</Label>
      </figcaption>
      <ul className="divide-y divide-line">
        {MILESTONES.map((m) => (
          <li key={m.week} className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-3 py-3.5">
            <span className="num text-sm text-ink-3">week {m.week}</span>
            <span className="text-sm text-ink-3">{m.note}</span>
            <span className="num text-lg font-semibold text-ink">{m.weight}</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/**
 * The app's own rail, on the public page. Same width, same pill items, so the
 * left edge of the content sits exactly where it sits once you are signed in.
 */
export function Landing({ onUnlocked }: { onUnlocked: () => void }) {
  const reduceMotion = useReducedMotion()
  const railHidden = useRailHidden()
  const [active, setActive] = useState('top')

  /* Which section the rail should light up. An observer rather than a scroll
     listener: the browser does the work and there is nothing to throttle.
     The callback reports whichever sections changed, not which one you are
     looking at, so the set is kept and the topmost one in page order wins. */
  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (n): n is HTMLElement => n !== null,
    )
    if (nodes.length === 0) return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        /* Nothing straddling the middle band means we are between sections:
           keep the last answer rather than blanking the rail. */
        const current = SECTIONS.find((s) => visible.has(s.id))
        if (current) setActive(current.id)
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    for (const node of nodes) observer.observe(node)
    return () => observer.disconnect()
  }, [])

  /* Anchor jumps move focus as well as the viewport, so the keyboard lands
     where the eye does. */
  const jump = useCallback(
    (id: string) => {
      const target = document.getElementById(id)
      if (!target) return
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      const focusable = target.querySelector<HTMLElement>(
        'input:not([type="hidden"]), button, [tabindex]:not([tabindex="-1"])',
      )
      focusable?.focus({ preventScroll: true })
    },
    [reduceMotion],
  )

  return (
    <div className="select-text min-h-[100dvh] bg-bg">
      <LandingRail
        sections={SECTIONS}
        active={active}
        onJump={jump}
        cta={{ label: 'Open my training', target: 'join', icon: <ArrowRight size={16} weight="bold" /> }}
        note="No account needed"
        crossLink={{ label: 'I run a gym', short: 'For gyms', href: '/for-gyms' }}
      />
      <RailToggle floating />
      <MobileBar
        onJump={jump}
        cta={{ label: 'Open my training', target: 'join' }}
        crossLink={{ label: 'I run a gym', short: 'For gyms', href: '/for-gyms' }}
      />

      <main className={railHidden ? undefined : 'lg:pl-60'}>
        {/* -------------------------------------------------------------- Hero */}
        <section id="top" className="relative overflow-hidden scroll-mt-4">
          <AuroraWash tone="green" className="-top-[28%] -left-[18%] size-[52vw] max-w-[860px]" />
          <ScaleGround className="top-32 -right-[14%] hidden w-[40vw] 2xl:flex" />

          <div
            className={cn(
              SHELL,
              'relative grid gap-12 pt-8 pb-12 sm:pt-10 sm:pb-16 md:pt-16 md:pb-20',
              'xl:grid-cols-[minmax(0,1fr)_minmax(23rem,27rem)] xl:items-start xl:gap-14 2xl:gap-20',
            )}
          >
            {/* Grouped, not evenly spaced: the claim and its sentence sit
                together, the actions step away, the data steps further. */}
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-5">
                <h1 className="max-w-[14ch] text-[2.75rem] leading-[1.02] tracking-tight text-ink sm:text-5xl 2xl:text-6xl">
                  A plan that admits how long it takes.
                </h1>
                <Lead>
                  enForma reads your goal, your level and the hours you actually have, then builds a
                  periodized programme out of {LIBRARY_SIZE} freely licensed
                  movements. It runs on this device, and the estimate it gives you is arithmetic you
                  can check.
                </Lead>
              </div>

            {/* Neither of these completes anything — one scrolls to the form
                that is already on screen, the other further down the page. The
                solid treatment belongs to the panel's own submit, so both step
                down a rung and the eye lands where the work happens. */}
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <Button variant="secondary" size="lg" onClick={() => jump('join')}>
                  Start on this device
                  <ArrowRight size={18} weight="bold" />
                </Button>
                <Button variant="ghost" size="lg" onClick={() => jump('estimate')}>
                  See how it plans
                  <ArrowDown size={18} weight="bold" />
                </Button>
              </div>

              <EstimateReadout />
            </div>

            {/* The lateral panel: the sign-in form itself, not a link to one. */}
            <section
              id="join"
              aria-label="Open your training"
              className="scroll-mt-24 xl:sticky xl:top-6"
            >
              <AuthPanel idPrefix="hero" onUnlocked={onUnlocked} accent />
              <p className="mt-4 text-center text-xs leading-relaxed text-ink-3">
                Local first: nothing leaves this device unless you turn on sync in Settings. A
                forgotten passphrase cannot be recovered.
              </p>
            </section>
          </div>
        </section>

        {/* ------------------------------------------------------------- Facts */}
        <Reveal>
          <div className={cn(SHELL, 'py-4')}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-line py-8 sm:gap-x-8 sm:gap-y-10 sm:py-10 md:grid-cols-4 md:py-12">
              {FACTS.map((fact) => (
                <div key={fact.label} className="flex flex-col items-center gap-2 text-center">
                  <dt className="sr-only">{fact.label}</dt>
                  <dd className="flex flex-col items-center gap-2">
                    <span className="flex items-baseline gap-2">
                      <span className="num text-4xl leading-none font-semibold text-ink md:text-5xl">
                        {fact.figure}
                      </span>
                      {fact.unit && <span className="text-base text-ink-3">{fact.unit}</span>}
                    </span>
                    <span className="max-w-[24ch] text-base leading-snug text-balance text-ink-3">
                      {fact.label}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Reveal>

        {/* ---------------------------------------------------------- Estimate */}
        <section id="estimate" className="scroll-mt-4 bg-surface">
          <div
            className={cn(
              READ,
              'grid gap-10 sm:gap-12 py-14 sm:py-20 md:py-28',
              'lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-20',
            )}
          >
            <Reveal className="flex flex-col gap-6">
              <SectionHeading>It refuses the timeline you wanted to hear.</SectionHeading>
              <Lead>
                Fat loss is paced between 0.4 and 1.0 kg a week and muscle between 0.06 and 0.35,
                adjusted for your age, your training days and how hard you said you would go. If the
                length you picked cannot hold the goal, the estimator says so before you commit, and
                recommends the shortest option that actually fits.
              </Lead>
              <ul className="flex max-w-[44ch] flex-col gap-4 text-base text-ink-2">
                {[
                  'Monthly, quarterly, half-year and annual programmes.',
                  'A target below a healthy BMI is flagged, not quietly accepted.',
                  'Every fourth week is lighter, so the plan survives contact with a real year.',
                ].map((line) => (
                  <li key={line} className="flex gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3"
                    />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.08} className="flex flex-col gap-8">
              <MilestoneLadder />
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  {
                    icon: CalendarBlank,
                    title: 'Periodized',
                    body: 'Blocks and deloads, not one week on repeat until you quit.',
                  },
                  {
                    icon: ChartLineUp,
                    title: 'Progressive',
                    body: 'Linear or double progression reads your last set and suggests the next.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex flex-col gap-2.5 rounded-xl bg-bg p-6 shadow-[var(--shadow-panel)]"
                  >
                    <item.icon size={22} weight="regular" className="text-accent-member" />
                    <span className="text-lg font-semibold text-ink">{item.title}</span>
                    <Body>{item.body}</Body>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ Inside */}
        <section id="inside" className="scroll-mt-4">
          <div className={cn(SHELL, 'flex flex-col gap-10 sm:gap-12 py-14 sm:py-20 md:py-28')}>
            <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-20">
              <SectionHeading className="md:max-w-[24ch]">
                Nine screens, and none of them sell you anything.
              </SectionHeading>
              <Lead className="md:max-w-[38ch] md:text-right">
                Planning, training, tracking and eating are one app here, not four subscriptions.
                Every screen below exists today and works with the network off.
              </Lead>
            </Reveal>

            {/* A ruled index rather than nine cards: at this width, lines group
                more quietly than boxes do. */}
            <Reveal delay={0.08}>
              <ul className="grid gap-x-12 gap-y-0 sm:grid-cols-2 xl:grid-cols-3">
                {INSIDE.map((item) => (
                  <li
                    key={item.title}
                    className="flex flex-col gap-3 border-t border-line py-7 md:py-8"
                  >
                    <item.icon size={22} weight="regular" className="text-accent-member" />
                    <span className="text-lg font-semibold text-ink">{item.title}</span>
                    <Body>{item.body}</Body>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Library */}
        <section id="library" className="scroll-mt-4 bg-surface">
          <div
            className={cn(
              SHELL,
              'grid gap-10 sm:gap-12 py-14 sm:py-20 md:py-28',
              'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-20',
            )}
          >
            <Reveal delay={0.08} className="order-2 lg:order-1">
              {/* The middle column drops half a step: an offset, not a contact
                  sheet. */}
              <ul className="grid grid-cols-4 gap-3 sm:gap-4">
                {MOVEMENTS.map((movement, i) => (
                  <li key={movement.file} className={cn(i % 4 === 1 && 'sm:translate-y-8')}>
                    <figure className="flex flex-col gap-2">
                      <img
                        src={`/repdb/${movement.file}.webp`}
                        alt={movement.name}
                        width={512}
                        height={512}
                        loading="lazy"
                        decoding="async"
                        className="aspect-square w-full rounded-md bg-surface-2 object-cover"
                      />
                      <figcaption className="truncate text-xs text-ink-3">
                        {movement.name}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal className="order-1 flex flex-col gap-6 lg:order-2">
              <SectionHeading>Calisthenics and the barbell in one planner.</SectionHeading>
              <Lead>
                {LIBRARY_SIZE} movements, freely licensed, filtered by muscle
                and by the equipment you can actually reach today. Bar at the gym, rings in a
                doorway, nothing but the floor —
                the generator picks from what you have and the weekly planner keeps both disciplines
                on the same page.
              </Lead>
              <Lead>
                Illustrations are real reference frames for the movements that have them. Nothing is
                drawn to fill a gap: a movement without a picture shows its name and its muscle, and
                says so plainly.
              </Lead>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Session */}
        <section id="session" className="scroll-mt-4">
          <div
            className={cn(
              READ,
              'grid gap-10 sm:gap-12 py-14 sm:py-20 md:py-28',
              'lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-20',
            )}
          >
            <Reveal className="flex flex-col gap-6">
              <SectionHeading>Built for a phone between sets.</SectionHeading>
              <Lead>
                Mid-session the screen has one job. The day preloads from your plan, sets log
                against 44-pixel steppers you can hit with gloves on, the rest timer runs at 90
                seconds and the screen stays awake while it does.
              </Lead>
            </Reveal>

            <Reveal delay={0.08}>
              <ul className="divide-y divide-line border-y border-line">
                {[
                  {
                    icon: Timer,
                    title: 'Rest timer and wake lock',
                    body: 'The countdown drains on screen and the phone does not sleep through it.',
                  },
                  {
                    icon: Barbell,
                    title: 'One-tap start',
                    body: "Today's session arrives loaded with the movements, sets and target reps.",
                  },
                  {
                    icon: ChartLineUp,
                    title: 'Records that mean it',
                    body: 'A first lift is not a record. Beating your estimated 1RM is, and it says so.',
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-5 py-6">
                    <item.icon
                      size={24}
                      weight="regular"
                      className="mt-0.5 shrink-0 text-accent-member"
                    />
                    <span className="flex flex-col gap-1.5">
                      <span className="text-lg font-semibold text-ink">{item.title}</span>
                      <Body className="max-w-[52ch]">{item.body}</Body>
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Privacy */}
        <section id="privacy" className="scroll-mt-4 bg-surface">
          <div className={cn(READ, 'flex flex-col gap-10 py-14 sm:gap-12 sm:py-20 md:py-28')}>
            <Reveal className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between md:gap-20">
              <SectionHeading>Local is the floor, not the ceiling.</SectionHeading>
              <Lead className="md:max-w-[40ch] md:text-right">
                Training with no account is a finished product, not a trial. It also has real
                edges. Both halves, plainly.
              </Lead>
            </Reveal>

            {/*
              A comparison rather than a pitch. The page has spent itself arguing
              that this app does not lie to you, so the moment it wants something
              it has to keep doing that: the left column is what you already have
              and keep, the right is what an account adds, and the cost of staying
              left is stated rather than skipped.
            */}
            <Reveal delay={0.08} className="grid gap-4 lg:grid-cols-2">
              {[
                {
                  eyebrow: 'On this device',
                  title: 'Yours, and only yours',
                  loud: false,
                  rows: [
                    ['Encrypted at rest', 'The passphrase derives the key. No back door.'],
                    ['Works with the signal off', 'Installable. A basement changes nothing.'],
                    ['The library, the planner, the session', 'Free, and it stays free.'],
                    ['Forget the passphrase and it is gone', 'No reset exists. Nobody can open it, us included.'],
                    ['One browser, one device', 'Clear the site data and the training goes with it.'],
                    ['Nobody can reach you', 'Gym news and enForma&rsquo;s own both need an account.'],
                  ],
                },
                {
                  eyebrow: 'With an account',
                  title: 'The same training, with a way back',
                  loud: true,
                  rows: [
                    ['A recovery code', 'The one thing that can re-open your training after a forgotten password.'],
                    ['Every device you sign into', 'The phone in the gym and the laptop at home, same plan.'],
                    ['Your gym reaches you', "Events to answer, offers to redeem, today's kitchen card with prices."],
                    ['Their challenges and notices', 'The thirty-day boards your gym runs, and what they publish.'],
                    ['Still sealed', 'The server stores rows it cannot read. The key never leaves your device.'],
                    ['Still free', 'Gyms pay for their side. Members never do.'],
                  ],
                },
              ].map((col) => (
                <div
                  key={col.eyebrow}
                  className={cn(
                    /* The clearest place on this page for the two colours: the
                       left column is what is yours alone, the right is the one
                       where a gym can reach you. Carried on a rule rather than
                       on the eyebrow text, which is 11px and would not clear
                       contrast in either accent on the light theme. */
                    'flex flex-col gap-5 rounded-xl border-t-2 bg-bg p-6 md:p-8',
                    col.loud
                      ? 'aurora-edge border-accent-gym shadow-[var(--shadow-tile)]'
                      : 'border-accent-member shadow-[var(--shadow-panel)]',
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label>{col.eyebrow}</Label>
                    <span className="text-xl font-semibold text-ink">{col.title}</span>
                  </div>
                  <dl className="flex flex-col divide-y divide-line">
                    {col.rows.map(([term, detail]) => (
                      <div key={term} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                        <dt className="text-base font-medium text-ink">{term}</dt>
                        <dd className="max-w-[46ch] text-sm leading-relaxed text-ink-3">{detail}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------- Second way in */}
        <section id="start" className="relative scroll-mt-4 overflow-hidden">
          {/* Orange at the closing panel: this is the point where an account —
              and the gym that can then reach you — enters the argument. */}
          <AuroraWash tone="orange" className="-right-[16%] -bottom-[30%] size-[44vw] max-w-[720px]" />
          <ScaleGround className="-bottom-[8%] -left-[10%] hidden w-[34vw] 2xl:flex" />

          <div
            className={cn(
              SHELL,
              'relative grid gap-10 sm:gap-12 py-14 sm:py-20 md:py-28',
              'xl:grid-cols-[minmax(0,1fr)_minmax(23rem,27rem)] xl:items-center xl:gap-20',
            )}
          >
            <Reveal className="flex flex-col gap-6">
              <SectionHeading>Start with a plan, not a promise.</SectionHeading>
              <Lead>
                Give it four or five answers and it will hand back a dated programme and the months
                it honestly takes. If you already train here, unlock your profile — or sign in to
                pull your training onto this device.
              </Lead>
              <ul className="flex flex-col gap-4 border-t border-line pt-8">
                {[
                  'No card, no trial, no email required to start.',
                  'Everything stays on this device until you say otherwise.',
                  'Export a backup from Settings whenever you want one.',
                ].map((line) => (
                  <li key={line} className="flex gap-3 text-base text-ink-2">
                    <span
                      aria-hidden="true"
                      className="mt-2.5 size-1.5 shrink-0 rounded-full bg-ink-3"
                    />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={0.08}>
              <section aria-label="Open your training, second panel">
                <AuthPanel idPrefix="start" onUnlocked={onUnlocked} />
              </section>
            </Reveal>
          </div>
        </section>

        {/* ------------------------------------------------------------ Footer */}
        <footer className="border-t border-line">
          <div
            className={cn(
              SHELL,
              'flex flex-col gap-6 py-8 sm:py-10 md:flex-row md:items-center md:justify-between',
            )}
          >
            <span className="flex items-center gap-3">
              <Mark />
              <span className="flex flex-col gap-0.5">
                <span className="text-lg font-semibold text-ink">enForma</span>
                <span className="text-sm text-ink-3">
                  Local-first training. No account, no cloud.
                </span>
              </span>
            </span>
            <p className="max-w-[52ch] text-sm leading-relaxed text-ink-3">
              Movement data from the public-domain free-exercise-db and by RepDB (repdb.co).
              enForma gives training structure, not medical advice — talk to a professional
              before a large change.
            </p>
          </div>
        </footer>
      </main>
    </div>
  )
}
