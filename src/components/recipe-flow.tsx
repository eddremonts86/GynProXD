import { useCallback, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import {
  ArrowCounterClockwise,
  BowlFood,
  Check,
  Drop,
  Flame,
  ForkKnife,
  Funnel,
  Knife,
  Oven,
  Snowflake,
  Timer,
} from '@phosphor-icons/react'
import { stepKind, stepMinutes, type StepKind } from '../lib/recipe-steps'
import { Button } from '../ui/Button'
import { cn } from '@/lib/utils'

/**
 * The method, as a flow you cook along with. Each step is a node on a rail
 * that fills as you tick them off, so a glance says how far in you are with
 * flour on your hands. Progress is kept per recipe on this device: closing the
 * tab mid-simmer should not lose your place.
 *
 * Motion is the point here, so it is also the thing to switch off: under
 * prefers-reduced-motion every animation collapses to a plain state change.
 */

const ICONS: Record<StepKind, typeof Flame> = {
  wash: Drop,
  cut: Knife,
  bake: Oven,
  heat: Flame,
  mix: BowlFood,
  chill: Snowflake,
  drain: Funnel,
  serve: ForkKnife,
  plain: Check,
}

function storageKey(recipeId: string): string {
  return `forma-recipe-progress-${recipeId}`
}

function loadProgress(recipeId: string, total: number): number[] {
  try {
    const raw = localStorage.getItem(storageKey(recipeId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((n): n is number => typeof n === 'number' && n >= 0 && n < total)
  } catch {
    return []
  }
}

export function RecipeFlow({ steps, recipeId }: { steps: string[]; recipeId: string }) {
  const reduceMotion = useReducedMotion()
  /* Read once on mount: the page remounts this per recipe (see the key at its
     usage), so there is no stale-id case to synchronise away. */
  const [done, setDone] = useState<number[]>(() => loadProgress(recipeId, steps.length))

  /* Functional updates, because someone ticking three steps off in one motion
     would otherwise have the later taps computed from a stale list and lost.
     The write rides along inside the updater: it is idempotent, so React
     replaying it in StrictMode costs nothing. */
  const write = useCallback(
    (next: number[]) => {
      try {
        localStorage.setItem(storageKey(recipeId), JSON.stringify(next))
      } catch {
        /* Private mode: the flow still works, it just forgets on reload. */
      }
      return next
    },
    [recipeId],
  )

  const toggle = useCallback(
    (index: number) => {
      setDone((prev) =>
        write(prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]),
      )
    },
    [write],
  )

  const reset = useCallback(() => setDone(() => write([])), [write])

  const parsed = useMemo(
    () => steps.map((text) => ({ text, kind: stepKind(text), minutes: stepMinutes(text) })),
    [steps],
  )

  /* The next thing to do: the first step not yet ticked. */
  const current = parsed.findIndex((_, i) => !done.includes(i))
  const progress = steps.length > 0 ? done.length / steps.length : 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-ink-3">
          <span className="num">{done.length}</span> of <span className="num">{steps.length}</span>{' '}
          steps done
        </p>
        {done.length > 0 && (
          <Button variant="ghost" size="xs" onClick={reset}>
            <ArrowCounterClockwise size={14} weight="bold" />
            Start over
          </Button>
        )}
      </div>

      <ol className="relative flex flex-col gap-3">
        {/* The rail behind the nodes, and the part of it already cooked. */}
        <div
          aria-hidden
          className="absolute top-5 bottom-5 left-[1.375rem] w-px bg-line"
        />
        {/* Plain CSS on purpose: this is the one element that changes on every
            tick, and a transform transition is the cheapest correct way to
            grow it. motion-reduce drops the animation, not the fill. */}
        <div
          aria-hidden
          className="absolute top-5 bottom-5 left-[1.375rem] w-px origin-top bg-ink transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none"
          style={{ transform: `scaleY(${progress})` }}
        />

        {parsed.map((step, index) => {
          const isDone = done.includes(index)
          const isCurrent = index === current
          const Icon = ICONS[step.kind]
          return (
            <motion.li
              key={index}
              initial={reduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { delay: Math.min(index * 0.05, 0.4), type: 'spring', stiffness: 140, damping: 20 }
              }
              className="relative"
            >
              <button
                type="button"
                onClick={() => toggle(index)}
                aria-pressed={isDone}
                className={cn(
                  'flex w-full items-start gap-3 rounded-lg p-2 text-left transition-colors duration-150',
                  'hover:bg-surface-2 active:scale-[0.995]',
                  isCurrent && !isDone && 'bg-surface-2',
                )}
              >
                <span
                  className={cn(
                    'relative z-10 mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors duration-200',
                    isDone
                      ? 'border-transparent bg-ink text-surface'
                      : isCurrent
                        ? 'border-ink bg-surface text-ink'
                        : 'border-line bg-surface text-ink-3',
                  )}
                >
                  {isDone ? (
                    <Check size={16} weight="bold" />
                  ) : (
                    <Icon size={17} weight="regular" />
                  )}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
                  <span
                    className={cn(
                      'text-sm leading-relaxed transition-colors duration-200',
                      isDone ? 'text-ink-3 line-through decoration-line' : 'text-ink-2',
                    )}
                  >
                    {step.text}
                  </span>
                  {step.minutes !== undefined && !isDone && (
                    <span className="inline-flex items-center gap-1 text-2xs text-ink-3">
                      <Timer size={12} weight="bold" />
                      <span className="num">{step.minutes}</span> min
                    </span>
                  )}
                </span>

                <span className="num pt-1.5 text-2xs text-ink-3">{index + 1}</span>
              </button>
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
