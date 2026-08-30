import { useCallback, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowDown,
  ArrowRight,
  Barbell,
  CalendarBlank,
  CloudSlash,
  LockKey,
  Timer,
  TrendUp,
} from '@phosphor-icons/react'
import { AuthPanel } from '@/components/auth-panel'
import { Mark, Wordmark } from '@/components/brand'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/ui/Button'
import { DotNumber } from '@/ui/DotNumber'
import { cn } from '@/lib/utils'

/**
 * The public face of enForma, shown to anyone without an open profile.
 *
 * The brief asked for a marketing page whose hero carries the sign-in form in a
 * side panel, with a second way into that form further down the page. Both
 * panels are real, independent mounts of `AuthPanel` rather than one form and
 * one link, so whichever you reach first is the one that opens the app.
 *
 * Two house rules shape everything else here. Nothing decorative stands in for
 * a photograph: the only pictures are the movement illustrations the library
 * already ships. And no figure on this page is invented — the timeline in the
 * hero is what `estimatePlan` actually returns for the profile beside it.
 */

/** A section that rises into place once, and not at all under reduced motion. */
function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/**
 * The mark blown up to architectural scale: four rules of decreasing length,
 * read as a measuring scale. It is the one large graphic on the page and it
 * carries no information, so it is hidden from assistive tech and never
 * intercepts a pointer.
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

/* The library ships flat illustrations for the movements it can. A handful of
   real ones, at the size the app itself shows them. */
const MOVEMENTS: { file: string; name: string }[] = [
  { file: 'barbell-row-peak', name: 'Barbell row' },
  { file: 'archer-pull-ups-peak', name: 'Archer pull-ups' },
  { file: 'banded-squat-peak', name: 'Banded squat' },
  { file: 'bench-dips-peak', name: 'Bench dips' },
  { file: 'banded-romanian-deadlift-peak', name: 'Romanian deadlift' },
  { file: 'ab-wheel-rollout-peak', name: 'Ab wheel rollout' },
]

/* Every one of these is a property of the build, not a claim about users. */
const FACTS: { figure: string; unit?: string; label: string }[] = [
  { figure: '873', label: 'movements in the library' },
  { figure: '0', label: 'accounts needed to train' },
  { figure: '2–6', unit: 'days', label: 'a week, split to fit' },
  { figure: '4th', unit: 'week', label: 'is a deload, every time' },
]

function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="max-w-[18ch] text-3xl leading-[1.1] text-ink md:text-4xl">{children}</h2>
}

function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('max-w-[54ch] text-base leading-relaxed text-ink-2', className)}>{children}</p>
  )
}

/**
 * The page's thesis as an artifact rather than a sentence: the numbers the
 * estimator returns for the profile in the caption. 60 kg at a safe 0.70 kg a
 * week is 86 weeks, and 86 weeks is 20 months. It says so.
 */
function EstimateReadout({ className }: { className?: string }) {
  return (
    <figure
      className={cn(
        'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-[var(--shadow-panel)]',
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xs text-ink-3">
        <span className="num text-ink-2">140 kg &rarr; 80 kg</span>
        <span aria-hidden="true">&middot;</span>
        <span className="num">age 40</span>
        <span aria-hidden="true">&middot;</span>
        <span className="num">3 days a week</span>
      </figcaption>

      <div className="flex items-end justify-between gap-4">
        <DotNumber value="20" unit="months" size="lg" className="text-ink" />
        <span className="num pb-1 text-right text-2xs leading-relaxed text-ink-3">
          60 kg &divide; 0.70 kg
          <br />
          per week = 86 weeks
        </span>
      </div>

      <p className="border-t border-line pt-3 text-2xs leading-relaxed text-ink-3">
        Ask for one month and it will still say twenty. The rate is capped at 1.0 kg a week and the
        arithmetic stays on screen.
      </p>
    </figure>
  )
}

function LandingNav({ onJump }: { onJump: (id: string) => void }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[76rem] items-center justify-between gap-4 px-4 md:px-8">
        <Wordmark />

        <nav aria-label="Page sections" className="hidden items-center gap-1 md:flex">
          {[
            { id: 'estimate', label: 'How it plans' },
            { id: 'library', label: 'Movements' },
            { id: 'session', label: 'In the gym' },
            { id: 'privacy', label: 'Privacy' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item.id)}
              className="rounded-full px-3.5 py-2 text-xs font-medium text-ink-3 transition-colors duration-150 hover:bg-surface hover:text-ink"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <span className="flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" onClick={() => onJump('join')}>
            Open my training
          </Button>
        </span>
      </div>
    </header>
  )
}

export function Landing({ onUnlocked }: { onUnlocked: () => void }) {
  const reduceMotion = useReducedMotion()

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
      <LandingNav onJump={jump} />

      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden">
        <ScaleGround className="top-24 -right-[10%] hidden w-[52vw] lg:flex" />

        <div className="relative mx-auto grid w-full max-w-[76rem] gap-10 px-4 pt-8 pb-16 md:px-8 md:pt-14 md:pb-24 lg:grid-cols-[1.05fr_minmax(24rem,0.95fr)] lg:items-start lg:gap-14">
          <div className="flex flex-col gap-7 lg:pt-6">
            <h1 className="max-w-[15ch] text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl sm:leading-[1.02] md:text-6xl">
              A plan that admits how long it takes.
            </h1>

            <Lead>
              enForma reads your goal, your level and the hours you actually have, then builds a
              periodized programme out of 873 public-domain movements. It runs on this device. No
              account is required, nothing is uploaded, and the estimate it gives you is arithmetic
              you can check.
            </Lead>

            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Button size="lg" onClick={() => jump('join')}>
                Start on this device
                <ArrowRight size={18} weight="bold" />
              </Button>
              <Button variant="secondary" size="lg" onClick={() => jump('estimate')}>
                See how it plans
                <ArrowDown size={18} weight="bold" />
              </Button>
            </div>

            <EstimateReadout className="mt-2 max-w-md" />
          </div>

          {/* The lateral panel: the sign-in form itself, not a link to one. */}
          <section
            id="join"
            aria-label="Open your training"
            className="scroll-mt-24 lg:sticky lg:top-24"
          >
            <AuthPanel idPrefix="hero" onUnlocked={onUnlocked} />
            <p className="mx-auto mt-4 max-w-sm text-center text-2xs leading-relaxed text-ink-3">
              Local first: nothing leaves this device unless you turn on sync in Settings. A
              forgotten passphrase cannot be recovered.
            </p>
          </section>
        </div>
      </section>

      {/* --------------------------------------------------------- Proof strip */}
      <Reveal>
        <div className="mx-auto w-full max-w-[76rem] px-4 md:px-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-8 border-y border-line py-8 md:grid-cols-4 md:py-10">
            {FACTS.map((fact) => (
              <div key={fact.label} className="flex flex-col gap-1">
                <dt className="sr-only">{fact.label}</dt>
                <dd className="flex flex-col gap-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-3xl leading-none font-semibold text-ink md:text-4xl">
                      {fact.figure}
                    </span>
                    {fact.unit && <span className="text-xs text-ink-3">{fact.unit}</span>}
                  </span>
                  <span className="max-w-[20ch] text-2xs leading-relaxed text-ink-3">
                    {fact.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ Estimate */}
      <section id="estimate" className="scroll-mt-20">
        <div className="mx-auto grid w-full max-w-[76rem] items-center gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal className="flex flex-col gap-6">
            <SectionHeading>It refuses the timeline you wanted to hear.</SectionHeading>
            <Lead>
              Fat loss is paced between 0.4 and 1.0 kg a week and muscle between 0.06 and 0.35,
              adjusted for your age, your training days and how hard you said you would go. If the
              length you picked cannot hold the goal, the estimator says so in the sentence before
              you commit, and recommends the shortest option that actually fits.
            </Lead>
            <ul className="flex flex-col gap-3 text-sm text-ink-2">
              {[
                'Monthly, quarterly, half-year and annual programmes.',
                'Milestones every fourth week with the weight you should be at.',
                'A target below a healthy BMI is flagged, not quietly accepted.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-3"
                  />
                  <span className="leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.08} className="lg:pl-6">
            <div className="flex flex-col gap-4">
              <EstimateReadout />
              <div className="grid grid-cols-2 gap-4">
                {[
                  {
                    icon: CalendarBlank,
                    title: 'Periodized',
                    body: 'Blocks and deloads, not one week on repeat.',
                  },
                  {
                    icon: TrendUp,
                    title: 'Progressive',
                    body: 'Linear or double progression suggests the next set.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex flex-col gap-2 rounded-xl bg-surface p-5 shadow-[var(--shadow-panel)]"
                  >
                    <item.icon size={20} weight="regular" className="text-ink-3" />
                    <span className="text-sm font-semibold text-ink">{item.title}</span>
                    <span className="text-2xs leading-relaxed text-ink-3">{item.body}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- Library */}
      <section id="library" className="scroll-mt-20 bg-surface">
        <div className="mx-auto grid w-full max-w-[76rem] items-center gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <Reveal delay={0.08} className="order-2 lg:order-1">
            {/* The middle column drops half a step: a deliberate offset, not a
                rigid contact sheet. */}
            <ul className="grid grid-cols-3 gap-3 sm:gap-4">
              {MOVEMENTS.map((movement, i) => (
                <li key={movement.file} className={cn(i % 3 === 1 && 'sm:translate-y-8')}>
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
                    <figcaption className="truncate text-[10px] text-ink-3">
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
              873 movements, public domain, filtered by muscle and by the equipment you can actually
              reach today. Bar at the gym, rings in a doorway, nothing but the floor — the generator
              picks from what you have and the weekly planner keeps both disciplines on the same
              page.
            </Lead>
            <Lead>
              Illustrations are real reference frames for the movements that have them. Nothing is
              drawn to fill a gap: a movement without a picture shows its name and its muscle, and
              says so plainly.
            </Lead>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- Session */}
      <section id="session" className="scroll-mt-20">
        <div className="mx-auto grid w-full max-w-[76rem] gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal className="flex flex-col gap-6">
            <SectionHeading>Built for a phone between sets.</SectionHeading>
            <Lead>
              Mid-session the screen has one job. The day preloads from your plan, sets log against
              44-pixel steppers you can hit with gloves on, the rest timer runs at 90 seconds and
              the screen stays awake while it does.
            </Lead>
          </Reveal>

          <Reveal delay={0.08}>
            <ul className="divide-y divide-line">
              {[
                {
                  icon: Timer,
                  title: 'Rest timer and wake lock',
                  body: 'The countdown drains on screen and the phone does not sleep through it.',
                },
                {
                  icon: Barbell,
                  title: 'One-tap start',
                  body: "Today's session is already loaded with the movements, sets and target reps.",
                },
                {
                  icon: TrendUp,
                  title: 'Records that mean something',
                  body: 'A first lift is not a record. Beating your estimated 1RM is, and it says so.',
                },
              ].map((item) => (
                <li key={item.title} className="flex gap-4 py-5 first:pt-0 last:pb-0">
                  <item.icon size={22} weight="regular" className="mt-0.5 shrink-0 text-ink-3" />
                  <span className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-ink">{item.title}</span>
                    <span className="text-2xs leading-relaxed text-ink-3">{item.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------- Privacy */}
      <section id="privacy" className="scroll-mt-20 bg-surface">
        <div className="mx-auto grid w-full max-w-[76rem] gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <Reveal className="flex flex-col gap-6">
            <SectionHeading>Your training does not need a server.</SectionHeading>
            <Lead>
              Every profile on this device is encrypted at rest under its own passphrase. Sync is
              off until you turn it on, and when you do the server receives rows it cannot read —
              the key never leaves your device, which is also why a forgotten passphrase is final.
            </Lead>
          </Reveal>

          <Reveal delay={0.08} className="grid gap-4 sm:grid-cols-2">
            {[
              {
                icon: LockKey,
                title: 'AES-GCM at rest',
                body: 'The passphrase derives the key. There is no reset and no back door.',
              },
              {
                icon: CloudSlash,
                title: 'Offline by default',
                body: 'Installable as an app. A dead signal in the basement changes nothing.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2 rounded-xl bg-bg p-5 shadow-[var(--shadow-panel)]"
              >
                <item.icon size={20} weight="regular" className="text-ink-3" />
                <span className="text-sm font-semibold text-ink">{item.title}</span>
                <span className="text-2xs leading-relaxed text-ink-3">{item.body}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- Second way in */}
      <section id="start" className="relative scroll-mt-20 overflow-hidden">
        <ScaleGround className="-bottom-[6%] -left-[8%] hidden w-[42vw] lg:flex" />

        <div className="relative mx-auto grid w-full max-w-[76rem] gap-10 px-4 py-20 md:px-8 md:py-28 lg:grid-cols-[1fr_minmax(24rem,0.9fr)] lg:items-center lg:gap-20">
          <Reveal className="flex flex-col gap-6">
            <SectionHeading>Start with a plan, not a promise.</SectionHeading>
            <Lead>
              Give it four or five answers and it will hand back a dated programme and the months it
              honestly takes. If you already train here, unlock your profile — or sign in to pull
              your training onto this device.
            </Lead>
          </Reveal>

          <Reveal delay={0.08}>
            <section aria-label="Open your training, second panel">
              <AuthPanel idPrefix="start" onUnlocked={onUnlocked} />
            </section>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------------- Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
          <span className="flex items-center gap-3">
            <Mark />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">enForma</span>
              <span className="text-2xs text-ink-3">
                Local-first training. No account, no cloud.
              </span>
            </span>
          </span>
          <p className="max-w-[46ch] text-2xs leading-relaxed text-ink-3">
            Movement data from the public-domain free-exercise-db. enForma gives training structure,
            not medical advice — talk to a professional before a large change.
          </p>
        </div>
      </footer>
    </div>
  )
}
