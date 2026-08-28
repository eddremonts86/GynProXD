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
  I: '2 sets per movement — short on time',
  II: '3 sets per movement — the standard day',
  III: '4 sets per movement — a big day',
}
