import { useEffect, useState } from 'react'
import {
  exerciseLanguages,
  loadExerciseDetails,
  type ExerciseDetail,
  type InstructionLanguage,
} from '@/lib/exercise-details'
import { loadWgerText, wgerCredit, wgerLanguages, type WgerText } from '@/lib/wger'
import { cn } from '@/lib/utils'
import type { Exercise } from '@/lib/types'

/**
 * How to do the movement, in whichever language the reader wants.
 *
 * English comes from the catalogue, which is already in memory, so the steps
 * are on screen with nothing fetched at all. Which OTHER languages exist comes
 * from a 53 KB index; the languages themselves live in a 620 KB chunk that is
 * requested only when somebody actually picks one. Opening a movement therefore
 * costs nothing, and reading it in Spanish costs it once per session.
 *
 * The picker appears only when there is something to pick. Most of the
 * catalogue has English and nothing else, and a control with one option is
 * furniture.
 */

const LANGUAGE_NAMES: Record<InstructionLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  it: 'Italiano',
  pl: 'Polski',
  tr: 'Türkçe',
  ru: 'Русский',
  zh: '中文',
  hi: 'हिन्दी',
  ko: '한국어',
}

/* English first because it is the app's language; the rest by how much of the
   catalogue they cover, so the likeliest second choice sits nearest. */
const LANGUAGE_ORDER: InstructionLanguage[] = ['en', 'es', 'fr', 'it', 'pl', 'tr', 'ru', 'zh', 'hi', 'ko']

export function MovementInstructions({ exercise }: { exercise: Exercise }) {
  const [detail, setDetail] = useState<ExerciseDetail | null>(null)
  const [wger, setWger] = useState<WgerText | null>(null)
  const [language, setLanguage] = useState<InstructionLanguage>('en')

  const credit = wgerCredit(exercise.id)
  const translations = credit ? wgerLanguages(exercise.id) : exerciseLanguages(exercise.id)
  const available = LANGUAGE_ORDER.filter(
    (code) => code === 'en' || translations.includes(code),
  )

  /* The text chunk is fetched by opening a wger movement or by choosing a
     language — never merely by opening a movement that already has its steps
     in the catalogue. */
  useEffect(() => {
    let live = true
    if (credit) {
      void loadWgerText().then((all) => {
        if (live) setWger(all[exercise.id] ?? null)
      })
    } else if (language !== 'en' || !exercise.instructions?.length) {
      void loadExerciseDetails().then((all) => {
        if (live) setDetail(all[exercise.id] ?? null)
      })
    }
    return () => {
      live = false
    }
  }, [exercise.id, language, exercise.instructions, credit])

  const translated = (credit ? wger : detail?.instructions) ?? {}
  const steps =
    language === 'en'
      ? (exercise.instructions?.length ? exercise.instructions : translated.en)
      : translated[language]

  /* A wger movement always renders, even before its text lands: the credit
     under it is an obligation, not a decoration. */
  if (!steps?.length && available.length === 1 && !credit) {
    return <p className="text-sm text-ink-3">No instructions available for this movement.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {available.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLanguage(code)}
              aria-pressed={code === language}
              className={cn(
                'rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-150',
                code === language
                  ? 'bg-ink text-surface'
                  : 'bg-surface-2 text-ink-3 hover:text-ink-2',
              )}
            >
              {LANGUAGE_NAMES[code]}
            </button>
          ))}
        </div>
      )}

      {steps?.length ? (
        <ol className="flex flex-col gap-2.5">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
              <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-ink-3">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      ) : credit ? null : (
        <p className="text-sm text-ink-3">No instructions available for this movement.</p>
      )}

      {credit && (
        /* Share-alike credits a person, and this is where it has to be legible:
           beside the words they wrote. */
        <p className="text-2xs text-ink-3">
          Description by {credit.author}, licensed{' '}
          <a
            href={credit.licenseUrl}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            {credit.license}
          </a>{' '}
          via{' '}
          <a
            href="https://wger.de"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            wger
          </a>
          .
        </p>
      )}
    </div>
  )
}
