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
 * unkind to. Non-explicit throughout, no erotica, and no language that would
 * not appear in a physiotherapist's handout. That line is not a matter of taste
 * — it is what keeps this inside a payment processor's acceptable use and
 * inside what the rest of this product sounds like.
 *
 * The one genuinely useful thing here is `avoidWith` and `suits`. A person with
 * a bad lower back or six months pregnant has the same question about this as
 * about a deadlift, and nowhere sensible to ask it. That is the feature; the
 * list of arrangements is the vehicle.
 *
 * ## The illustration slot
 *
 * Every entry carries an `art` field and today every one of them is `null`.
 * That is deliberate and it is not an oversight: the drawings are commissioned
 * work that has not been commissioned yet, and `docs/intimacy-illustrations.md`
 * is the brief that says what one has to be. The slot exists so that the
 * screen, the alt text, the attribution and the file naming are all decided
 * before anybody is paid to draw anything — and so that adding the first
 * illustration is one line here and a file in `public/intimacy/`.
 *
 * Drawings, not photographs, and that is a business constraint rather than a
 * preference: photographs of real people in sexual positions are adult content
 * under Stripe's restricted-business terms, and this product bills through
 * Stripe. `docs/plans/2026-09-03-life-plan-v2.md` prices the alternative.
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

/**
 * What the body is doing, which is the axis somebody actually searches on.
 *
 * A plural, because most arrangements put the two people in different ones and
 * flattening that to a single word would lie about half of them: "at the edge,
 * one standing" is a lying posture and a standing posture at once, and
 * somebody whose knees rule standing out needs that visible rather than
 * averaged away.
 */
export type Posture = 'lying' | 'seated' | 'kneeling' | 'standing'

export const POSTURE_LABELS: Record<Posture, string> = {
  lying: 'Lying',
  seated: 'Seated',
  kneeling: 'Kneeling',
  standing: 'Standing',
}

/**
 * A commissioned drawing, once there is one.
 *
 * `alt` is written with the illustration rather than derived from the name,
 * because a description of a drawing is not the same sentence as a description
 * of the arrangement, and somebody using a screen reader is owed the first one.
 * `credit` and `licence` exist so that the attribution is captured at the
 * moment the file arrives instead of reconstructed later from an invoice.
 */
export interface Illustration {
  /** A file in `public/intimacy/`, named `<id>.webp`. See the brief. */
  file: string
  alt: string
  credit: string
  licence: string
}

/** Where the files live once they exist, and the shape they are drawn to. */
export const ART_DIR = '/intimacy/'
export const ART_ASPECT = 4 / 3

export interface IntimateActivity {
  id: string
  /** Descriptive rather than colloquial, and the same in both languages. */
  name: string
  /** How the two people are arranged. One or two plain sentences. */
  description: string
  effort: Effort
  /** What the body is doing, one entry per person where they differ. */
  postures: Posture[]
  /** Whether the two people are facing each other. */
  facing: boolean
  /** Which body parts carry the load, in the catalogue's own vocabulary. */
  loads: string[]
  /** Limitations this is unkind to. Filtered out when somebody names one. */
  avoidWith: Limitation[]
  /** Limitations this is comfortable with, and worth offering because of. */
  suits: Limitation[]
  /** One practical line. Never medical, never a claim about anybody's body. */
  note?: string
  /** The drawing, or null while there is not one. See the file header. */
  art: Illustration | null
}

/**
 * Sixteen entries, written rather than generated.
 *
 * It was eight, chosen to cover the range of effort. Sixteen covers the range
 * of *posture* as well, which is what the search added: somebody who cannot
 * kneel, cannot stand, or cannot lie flat should each find the list still has
 * something in it. Beyond this a longer list stops being a filter and starts
 * being a catalogue, which is a content decision with a person behind it.
 */
export const INTIMATE_ACTIVITIES: IntimateActivity[] = [
  {
    id: 'facing-side',
    name: 'Side by side, facing',
    description:
      'Both partners lie on their sides, facing each other, legs interleaved. Neither carries the other weight.',
    effort: 'light',
    postures: ['lying'],
    facing: true,
    loads: ['core'],
    avoidWith: [],
    suits: ['knees', 'lower-back', 'hips', 'wrists', 'pregnancy', 'limited-mobility'],
    note: 'A pillow under the lower knee takes the last of the load off the hip.',
    art: null,
  },
  {
    id: 'spooning',
    name: 'Side by side, one behind',
    description:
      'Both partners lie on the same side, one behind the other, knees drawn up a little.',
    effort: 'light',
    postures: ['lying'],
    facing: false,
    loads: ['core', 'glutes'],
    avoidWith: [],
    suits: ['lower-back', 'knees', 'shoulders', 'pregnancy', 'limited-mobility'],
    note: 'The most forgiving arrangement for a back that objects to being flexed.',
    art: null,
  },
  {
    id: 'side-crossed',
    name: 'Side by side, crossed',
    description:
      'Both partners lie on their sides at an angle to each other, legs crossed rather than interleaved, each taking their own weight on the floor or mattress.',
    effort: 'light',
    postures: ['lying'],
    facing: true,
    loads: ['core'],
    avoidWith: ['hips'],
    suits: ['lower-back', 'knees', 'shoulders', 'neck', 'pregnancy'],
    note: 'Neither person is under the other, which is what keeps it available late in a pregnancy.',
    art: null,
  },
  {
    id: 'supine-receiving',
    name: 'On the back, receiving',
    description:
      'One partner lies on their back with knees bent and feet flat; the other kneels or lies above, taking their own weight on hands or forearms.',
    effort: 'light',
    postures: ['lying', 'kneeling'],
    facing: true,
    loads: ['core'],
    avoidWith: ['pregnancy'],
    suits: ['knees', 'hips', 'limited-mobility'],
    note: 'Late in pregnancy, lying flat on the back is usually uncomfortable; the side arrangements are the alternative.',
    art: null,
  },
  {
    id: 'prone-supported',
    name: 'Face down, supported',
    description:
      'One partner lies face down with a pillow under the hips; the other above, taking their own weight on forearms or knees.',
    effort: 'light',
    postures: ['lying'],
    facing: false,
    loads: ['core'],
    avoidWith: ['pregnancy', 'neck'],
    suits: ['knees', 'hips', 'wrists', 'limited-mobility'],
    note: 'The pillow is the whole difference: without it the lower back arches and does the work.',
    art: null,
  },
  {
    id: 'supine-legs-supported',
    name: 'On the back, legs supported',
    description:
      'One partner lies on their back with their legs raised and resting against the other, who kneels upright and holds them.',
    effort: 'moderate',
    postures: ['lying', 'kneeling'],
    facing: true,
    loads: ['core', 'hamstrings'],
    avoidWith: ['hips', 'lower-back', 'pregnancy'],
    suits: ['knees', 'wrists', 'neck'],
    note: 'How far the legs come up is the whole variable, and they do not have to come up far.',
    art: null,
  },
  {
    id: 'supine-above',
    name: 'On the back, above',
    description:
      'One partner lies on their back; the other sits upright astride, feet or shins taking the weight.',
    effort: 'moderate',
    postures: ['lying', 'seated'],
    facing: true,
    loads: ['quads', 'glutes', 'core'],
    avoidWith: ['knees', 'hips'],
    suits: ['lower-back', 'shoulders', 'wrists'],
    note: 'The person underneath does very little, which is the point of it for a sore back.',
    art: null,
  },
  {
    id: 'reclined-supported',
    name: 'Half reclined, facing',
    description:
      'One partner half sits against a headboard or a stack of pillows rather than lying flat; the other sits astride, facing them.',
    effort: 'moderate',
    postures: ['seated', 'lying'],
    facing: true,
    loads: ['core', 'quads'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'shoulders', 'wrists', 'neck'],
    note: 'Half upright is kinder to a neck than flat and kinder to a back than sitting straight.',
    art: null,
  },
  {
    id: 'seated-facing',
    name: 'Seated, facing',
    description:
      'One partner sits on a firm chair or the edge of a bed with both feet on the floor; the other sits astride, facing them.',
    effort: 'moderate',
    postures: ['seated'],
    facing: true,
    loads: ['core', 'quads'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'limited-mobility', 'pregnancy'],
    note: 'A chair with a back to lean against turns this into one of the least demanding options.',
    art: null,
  },
  {
    id: 'seated-supported',
    name: 'Seated, supported behind',
    description:
      'One partner sits with their back against a wall or headboard, legs extended; the other sits astride facing away.',
    effort: 'moderate',
    postures: ['seated'],
    facing: false,
    loads: ['core', 'hamstrings'],
    avoidWith: ['knees'],
    suits: ['shoulders', 'wrists', 'lower-back'],
    art: null,
  },
  {
    id: 'seated-one-behind',
    name: 'Seated, one behind',
    description:
      'Both partners sit on a firm chair, one behind the other, feet on the floor and backs upright.',
    effort: 'light',
    postures: ['seated'],
    facing: false,
    loads: ['core'],
    avoidWith: [],
    suits: ['knees', 'lower-back', 'wrists', 'neck', 'limited-mobility'],
    note: 'A chair with arms gives both people something to push against, which is most of the effort gone.',
    art: null,
  },
  {
    id: 'edge-of-bed',
    name: 'At the edge, one standing',
    description:
      'One partner lies on their back at the edge of a bed; the other stands at the side, feet flat on the floor.',
    effort: 'moderate',
    postures: ['lying', 'standing'],
    facing: true,
    loads: ['quads', 'core'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'shoulders', 'wrists', 'limited-mobility'],
    note: 'The height of the bed does the work; a low bed puts all of it back into the standing knees.',
    art: null,
  },
  {
    id: 'kneeling-forward',
    name: 'Kneeling, leaning forward',
    description:
      'One partner kneels and leans forward onto forearms or a stack of pillows; the other kneels behind.',
    effort: 'moderate',
    postures: ['kneeling'],
    facing: false,
    loads: ['glutes', 'core', 'shoulders'],
    avoidWith: ['knees', 'wrists'],
    suits: ['lower-back', 'pregnancy'],
    note: 'Forearms rather than hands keeps the wrists out of it entirely.',
    art: null,
  },
  {
    id: 'kneeling-facing',
    name: 'Kneeling, upright, facing',
    description:
      'Both partners kneel upright, facing each other, thighs vertical and hands free.',
    effort: 'moderate',
    postures: ['kneeling'],
    facing: true,
    loads: ['quads', 'glutes', 'core'],
    avoidWith: ['knees', 'hips'],
    suits: ['lower-back', 'wrists', 'neck'],
    note: 'A folded blanket under both pairs of knees changes this more than anything else on the list.',
    art: null,
  },
  {
    id: 'leaning-support',
    name: 'Standing, leaning on a support',
    description:
      'One partner stands and leans forward onto a table, a sofa back or a chest of drawers; the other stands behind.',
    effort: 'moderate',
    postures: ['standing'],
    facing: false,
    loads: ['glutes', 'core', 'shoulders'],
    avoidWith: ['lower-back', 'limited-mobility'],
    suits: ['knees', 'wrists', 'neck'],
    note: 'The support wants to be high enough that the back stays long rather than folded.',
    art: null,
  },
  {
    id: 'standing-braced',
    name: 'Standing, braced',
    description:
      'Both partners stand, one braced against a wall or a solid surface with hands or forearms.',
    effort: 'vigorous',
    postures: ['standing'],
    facing: false,
    loads: ['quads', 'glutes', 'calves', 'core'],
    avoidWith: ['knees', 'hips', 'lower-back', 'limited-mobility'],
    suits: ['wrists'],
    note: 'The most demanding of these on the legs, and the one a tired pair of quads will notice.',
    art: null,
  },
]
