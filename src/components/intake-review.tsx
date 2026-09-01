import { useState } from 'react'
import { CaretDown, Sparkle, Quotes, Pencil } from '@phosphor-icons/react'
import { Tag } from '../ui/Tag'
import { cn } from '@/lib/utils'
import type { Provenance } from '../lib/onboarding-parse'

/** Where a value came from, once a person has had a chance to touch it. */
export type Standing = 'default' | Provenance | 'edited'

export interface ReviewField {
  key: string
  label: string
  /** What the field currently holds, rendered for reading rather than editing. */
  display: string
  standing: Standing
  /** The editor itself, so this component never owns anyone's state. */
  control: React.ReactNode
}

const ORDER: Record<Standing, number> = { default: 0, inferred: 1, edited: 2, quoted: 3 }

const GROUPS: Array<{
  standing: Standing
  title: string
  blurb: string
  tone: 'warn' | 'neutral' | 'good'
}> = [
  {
    standing: 'default',
    title: 'You did not mention these',
    blurb: 'Sensible starting points, and the ones most worth a glance — a programme paced from a weight nobody gave it is paced from a guess.',
    tone: 'warn',
  },
  {
    standing: 'inferred',
    title: 'Read between the lines',
    blurb: 'Worked out from what you wrote rather than quoted from it. This is where a misreading hides.',
    tone: 'neutral',
  },
  { standing: 'edited', title: 'You changed these', blurb: '', tone: 'good' },
  { standing: 'quoted', title: 'Straight from your words', blurb: '', tone: 'good' },
]

/**
 * The step that always exists.
 *
 * The parser is most confident exactly when it is guessing: on the placeholder
 * this app ships in its own textarea it used to report every field understood
 * while reading "3 times a week for 2 hours" as two hours a session and the word
 * "gym" as a barbell-only pool. Skipping this screen when a sentence looked
 * complete would turn a 60% reading into a programme nobody had reason to doubt.
 *
 * So the screen is constant and the *effort* varies. What was guessed or never
 * said opens expanded, at the top, at full size. What was quoted collapses into
 * a row of chips you can open if you disagree. Reading it should take a moment
 * when the sentence was good and a minute when it was not.
 */
export function IntakeReview({ fields }: { fields: ReviewField[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const sorted = [...fields].sort((a, b) => ORDER[a.standing] - ORDER[b.standing])

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((group) => {
        const inGroup = sorted.filter((f) => f.standing === group.standing)
        if (inGroup.length === 0) return null
        const collapsedByDefault = group.standing === 'quoted' || group.standing === 'edited'

        return (
          <section key={group.standing} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                {group.standing === 'inferred' && <Sparkle size={13} className="text-ink-3" />}
                {group.standing === 'quoted' && <Quotes size={13} className="text-ink-3" />}
                {group.standing === 'edited' && <Pencil size={13} className="text-ink-3" />}
                <h3 className="text-xs font-semibold text-ink">{group.title}</h3>
                <Tag tone={group.tone === 'warn' ? 'neutral' : 'good'}>{inGroup.length}</Tag>
              </div>
              {group.blurb && <p className="max-w-[62ch] text-2xs leading-snug text-ink-3">{group.blurb}</p>}
            </div>

            {collapsedByDefault ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {inGroup.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setOpen((o) => ({ ...o, [f.key]: !o[f.key] }))}
                      aria-expanded={!!open[f.key]}
                      className={cn(
                        'group inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-2xs transition-colors duration-150',
                        open[f.key]
                          ? 'border-brand bg-brand-soft text-ink'
                          : 'border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink',
                      )}
                    >
                      <span className="text-ink-3">{f.label}</span>
                      <span className="num font-medium">{f.display}</span>
                      <CaretDown
                        size={10}
                        className={cn(
                          'text-ink-3 transition-transform duration-150',
                          open[f.key] && 'rotate-180',
                        )}
                      />
                    </button>
                  ))}
                </div>
                {inGroup.some((f) => open[f.key]) && (
                  <div className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-panel)] sm:grid-cols-2 xl:grid-cols-3">
                    {inGroup.filter((f) => open[f.key]).map((f) => (
                      <div key={f.key}>{f.control}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 rounded-xl bg-surface p-4 shadow-[var(--shadow-panel)] sm:grid-cols-2 xl:grid-cols-3">
                {inGroup.map((f) => (
                  <div key={f.key}>{f.control}</div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
