/**
 * The intimate activity module's own content, in its own file.
 *
 * **Not merged into the movement catalogue, and that is structural rather than
 * squeamish.** `exercises-generated.ts` is rebuilt by
 * `scripts/import-exercises.mjs`, so anything added to it is gone on the next
 * run; and it feeds `allowedExerciseIds()`, which is the pool the programme
 * coach draws from, so a merged row could arrive in somebody's generated
 * Tuesday. The wger dataset is kept separate for a parallel reason and the
 * precedent is exactly right.
 *
 * ## What this content is, and is not
 *
 * Plain descriptions of how two people are arranged, written the way a movement
 * entry is written: what is where, what it asks of the body, and what it is
 * unkind to. Non-explicit throughout, no imagery, no erotica, and no language
 * that would not appear in a physiotherapist's handout. That line is not a
 * matter of taste — it is what keeps this inside a payment processor's
 * acceptable use and inside what the rest of this product sounds like.
 *
 * The one genuinely useful thing here is `avoidWith` and `suits`. A person with
 * a bad lower back or six months pregnant has the same question about this as
 * about a deadlift, and nowhere sensible to ask it. That is the feature; the
 * list of arrangements is the vehicle.
 *
 * ## Effort, and the number this deliberately does not print
 *
 * Effort is qualitative plus a MET band. The published measurements put
 * partnered sexual activity in the light-to-moderate range in short bouts —
 * broadly comparable to walking briskly, not to a training session — and the
 * energy cost measured in the laboratory is far below the figure that
 * circulates in magazines. See:
 *
 *   Frappier J. et al., "Energy expenditure during sexual activity in young
 *   healthy couples", PLOS ONE 8(10), 2013.
 *   Ainsworth B.E. et al., "2011 Compendium of Physical Activities", codes
 *   for sexual activity.
 *
 * So no calorie figure is shown anywhere in this module. A product whose whole
 * claim is that it refuses to lie about how long fat loss takes does not get to
 * start estimating this, and a member who wants a number would be given a bad
 * one. `plan-estimate.ts` sets that standard and this file keeps it.
 */

/** What a body might be working around. Musculoskeletal and pregnancy only. */
export type Limitation =
  | 'knees'
  | 'hips'
  | 'lower-back'
  | 'shoulders'
  | 'wrists'
  | 'neck'
  | 'pregnancy'
  | 'limited-mobility'

export const LIMITATION_LABELS: Record<Limitation, string> = {
  knees: 'Knees',
  hips: 'Hips',
  'lower-back': 'Lower back',
  shoulders: 'Shoulders',
  wrists: 'Wrists',
  neck: 'Neck',
  pregnancy: 'Pregnancy',
  'limited-mobility': 'Limited mobility',
}

export type Effort = 'light' | 'moderate' | 'vigorous'

export const EFFORT_LABELS: Record<Effort, string> = {
  light: 'Light',
  moderate: 'Moderate',
  vigorous: 'Vigorous',
}

/** The MET band each effort level covers, for anyone who wants the units. */
export const EFFORT_METS: Record<Effort, string> = {
  light: '1.5 to 2.5 MET',
  moderate: '2.5 to 4 MET',
  vigorous: '4 to 6 MET',
}

export interface IntimateActivity {
  id: string
  /** Descriptive rather than colloquial, and the same in both languages. */
  name: string
  /** How the two people are arranged. One or two plain sentences. */
  description: string
  effort: Effort
  /** Which body parts carry the load, in the catalogue's own vocabulary. */
  loads: string[]
  /** Limitations this is unkind to. Filtered out when somebody names one. */
  avoidWith: Limitation[]
  /** Limitations this is comfortable with, and worth offering because of. */
  suits: Limitation[]
  /** One practical line. Never medical, never a claim about anybody's body. */
  note?: string
}

/**
 * Eight entries, not eighty.
 *
 * Enough to cover the range of effort and the common limitations, and few
 * enough that each one was written rather than generated. A longer list is a
 * content decision with a person behind it, the same conclusion Phase 5 reached
 * about a venue directory.
 */
export const INTIMATE_ACTIVITIES: IntimateActivity[] = [
  {
    id: 'facing-side',
    name: 'Side by side, facing',
    description:
      'Both partners lie on their sides, facing each other, legs interleaved. Neither carries the other weight.',
    effort: 'light',
    loads: ['core'],
    avoidWith: [],
    suits: ['knees', 'lower-back', 'hips', 'wrists', 'pregnancy', 'limited-mobility'],
    note: 'A pillow under the lower knee takes the last of the load off the hip.',
  },
  {
    id: 'spooning',
    name: 'Side by side, one behind',
    description:
      'Both partners lie on the same side, one behind the other, knees drawn up a little.',
    effort: 'light',
    loads: ['core', 'glutes'],
    avoidWith: [],
    suits: ['lower-back', 'knees', 'shoulders', 'pregnancy', 'limited-mobility'],
    note: 'The most forgiving arrangement for a back that objects to being flexed.',
  },
  {
    id: 'supine-receiving',
    name: 'On the back, receiving',
    description:
      'One partner lies on their back with knees bent and feet flat; the other kneels or lies above, taking their own weight on hands or forearms.',
    effort: 'light',
    loads: ['core'],
    avoidWith: ['pregnancy'],
    suits: ['knees', 'hips', 'limited-mobility'],
    note: 'Late in pregnancy, lying flat on the back is usually uncomfortable; the side arrangements are the alternative.',
  },
  {
    id: 'supine-above',
    name: 'On the back, above',
    description:
      'One partner lies on their back; the other sits upright astride, feet or shins taking the weight.',
    effort: 'moderate',
    loads: ['quads', 'glutes', 'core'],
    avoidWith: ['knees', 'hips'],
    suits: ['lower-back', 'shoulders', 'wrists'],
    note: 'The person underneath does very little, which is the point of it for a sore back.',
  },
  {
    id: 'seated-facing',
    name: 'Seated, facing',
    description:
      'One partner sits on a firm chair or the edge of a bed with both feet on the floor; the other sits astride, facing them.',
    effort: 'moderate',
    loads: ['core', 'quads'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'limited-mobility', 'pregnancy'],
    note: 'A chair with a back to lean against turns this into one of the least demanding options.',
  },
  {
    id: 'seated-supported',
    name: 'Seated, supported behind',
    description:
      'One partner sits with their back against a wall or headboard, legs extended; the other sits astride facing away.',
    effort: 'moderate',
    loads: ['core', 'hamstrings'],
    avoidWith: ['knees'],
    suits: ['shoulders', 'wrists', 'lower-back'],
  },
  {
    id: 'kneeling-forward',
    name: 'Kneeling, leaning forward',
    description:
      'One partner kneels and leans forward onto forearms or a stack of pillows; the other kneels behind.',
    effort: 'moderate',
    loads: ['glutes', 'core', 'shoulders'],
    avoidWith: ['knees', 'wrists'],
    suits: ['lower-back', 'pregnancy'],
    note: 'Forearms rather than hands keeps the wrists out of it entirely.',
  },
  {
    id: 'standing-braced',
    name: 'Standing, braced',
    description:
      'Both partners stand, one braced against a wall or a solid surface with hands or forearms.',
    effort: 'vigorous',
    loads: ['quads', 'glutes', 'calves', 'core'],
    avoidWith: ['knees', 'hips', 'lower-back', 'limited-mobility'],
    suits: ['wrists'],
    note: 'The most demanding of these on the legs, and the one a tired pair of quads will notice.',
  },
]
