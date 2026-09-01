import { wgerExercises } from '../data/exercises-wger-generated'
import type { InstructionLanguage } from './exercise-details'

/**
 * The wger half of the library, and the attribution that has to travel with it.
 *
 * Their content is CC-BY-SA, so two obligations follow us into the app. Credit
 * names a person, not a project: 754 movements were written by different
 * contributors under three different licences, and `wgerCredit` is what puts
 * the right name and the right licence under the right movement. And the text
 * may not be relicensed, which is why it lives in its own files and is never
 * folded into the catalogue — see scripts/import-wger.mjs for the long version.
 */

export interface WgerCredit {
  author: string
  license: string
  licenseUrl: string
}

const credits = new Map<string, WgerCredit>(
  wgerExercises.map((e) => [
    e.id,
    { author: e.licenseAuthor, license: e.license, licenseUrl: e.licenseUrl },
  ]),
)

/** Null for anything that did not come from wger, which is most of the library. */
export function wgerCredit(exerciseId: string): WgerCredit | null {
  return credits.get(exerciseId) ?? null
}

/**
 * Descriptions, in English and — for 561 of them — Spanish. Half a megabyte,
 * so it is fetched the first time somebody opens one of these movements and not
 * before. The markup was flattened to plain text at import: nothing that came
 * out of a public wiki is rendered as HTML here.
 */
export type WgerText = Partial<Record<InstructionLanguage, string[]>>

let text: Record<string, WgerText> | null = null
let pending: Promise<Record<string, WgerText>> | null = null

export function loadWgerText(): Promise<Record<string, WgerText>> {
  if (text) return Promise.resolve(text)
  pending ??= import('../data/exercise-wger-text.json').then((module) => {
    text = module.default as Record<string, WgerText>
    return text
  })
  return pending
}

const languages = new Map<string, InstructionLanguage[]>(
  wgerExercises.map((e) => [e.id, e.languages]),
)

/** Which languages this wger movement was written in. Cheap: no chunk fetched. */
export function wgerLanguages(exerciseId: string): InstructionLanguage[] {
  return languages.get(exerciseId) ?? []
}
