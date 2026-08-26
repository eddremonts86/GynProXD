import type { Intensity } from './types'

/**
 * The volume dial, chosen at execution time. It scales the session's target
 * sets without touching the stored plan or the programme's timeline — the
 * plan-design dial ("effort") is a different axis and stays untouched.
 */

export const INTENSITIES: Intensity[] = ['I', 'II', 'III']

/** Target sets per movement at each dial position. A goal, never a cap. */
export const INTENSITY_SETS: Record<Intensity, number> = { I: 2, II: 3, III: 4 }

export const INTENSITY_HELP: Record<Intensity, string> = {
  I: 'Short on time: 2 target sets per movement.',
  II: 'The standard day: 3 target sets per movement.',
  III: 'Big day: 4 target sets per movement.',
}
