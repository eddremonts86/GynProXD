import { Check } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

export interface WizardStep {
  id: string
  title: string
  /** One line under the title on the current step. Absent steps stay quiet. */
  hint?: string
}

interface WizardRailProps {
  steps: WizardStep[]
  current: number
  /** Jumping is allowed backwards and to anything already visited, never forwards. */
  furthest: number
  onGo: (index: number) => void
}

/**
 * The spine of the intake: where you are, what you have done, what is left.
 *
 * Vertical beside the content on a wide screen and a horizontal strip on a
 * narrow one — the same list, not two components, because a step that only
 * exists in one layout is a step that gets forgotten in the other.
 *
 * You can go back to anything you have seen and never forward past it. Not to
 * gate anyone: every field has a default and the last step would happily design
 * from them. It is so the numbers on the review step are ones somebody has
 * actually looked at, which is the entire reason that step exists.
 */
export function WizardRail({ steps, current, furthest, onGo }: WizardRailProps) {
  return (
    <nav aria-label="Plan steps">
      {/* Wide: a vertical list, with the rule running through the numbers rather
          than beside them, so the eye follows one line instead of two. */}
      <ol className="hidden lg:flex lg:flex-col">
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          const reachable = i <= furthest
          return (
            <li key={step.id} className="relative flex gap-3 pb-6 last:pb-0">
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-7 bottom-0 left-[0.6875rem] w-px',
                    state === 'done' ? 'bg-brand' : 'bg-line',
                  )}
                />
              )}
              <button
                type="button"
                onClick={() => reachable && onGo(i)}
                disabled={!reachable}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'relative z-1 grid size-[1.375rem] shrink-0 place-items-center rounded-full border text-[0.625rem] font-semibold transition-colors duration-150',
                  state === 'done' && 'border-brand bg-brand text-brand-ink',
                  state === 'current' && 'border-brand bg-bg text-brand ring-2 ring-brand/25',
                  state === 'todo' && 'border-line bg-bg text-ink-3',
                  reachable ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                {state === 'done' ? <Check size={11} weight="bold" /> : i + 1}
              </button>
              <div className="flex min-w-0 flex-col gap-0.5 pt-px">
                <button
                  type="button"
                  onClick={() => reachable && onGo(i)}
                  disabled={!reachable}
                  className={cn(
                    'text-left text-xs font-medium transition-colors duration-150',
                    state === 'current' ? 'text-ink' : state === 'done' ? 'text-ink-2 hover:text-ink' : 'text-ink-3',
                    reachable ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  {step.title}
                </button>
                {state === 'current' && step.hint && (
                  <p className="text-2xs leading-snug text-ink-3">{step.hint}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {/* Narrow: the same steps as a strip. Numbers only — the titles are the
          first thing on the panel below, and repeating them here costs the width
          that makes the strip readable. */}
      <ol className="flex items-center gap-1.5 lg:hidden">
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          const reachable = i <= furthest
          return (
            <li key={step.id} className="flex flex-1 items-center gap-1.5">
              <button
                type="button"
                onClick={() => reachable && onGo(i)}
                disabled={!reachable}
                aria-label={`Step ${i + 1}: ${step.title}`}
                aria-current={state === 'current' ? 'step' : undefined}
                className={cn(
                  'h-1 flex-1 rounded-full transition-colors duration-150',
                  state === 'done' && 'bg-brand',
                  state === 'current' && 'bg-brand',
                  state === 'todo' && 'bg-line',
                )}
              />
            </li>
          )
        })}
      </ol>
      <p className="mt-2 text-2xs text-ink-3 lg:hidden">
        Step {current + 1} of {steps.length} · {steps[current]?.title}
      </p>
    </nav>
  )
}
