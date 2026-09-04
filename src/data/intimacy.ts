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
 * Descriptions of how two adults are arranged, written the way a movement entry
 * is written: how to get into it, what carries the weight, what it actually
 * does, and what it costs the body. They name what is happening in anatomical
 * terms — depth, angle, contact, who is moving — because a description that
 * will not say what an arrangement is for is no use to the person choosing
 * between sixteen of them, and being coy was the first version's real failure.
 *
 * The register is a clinician's leaflet on sex after an injury, not erotica:
 * second person is avoided, nothing is addressed to the reader as an
 * invitation, nothing is described for arousal, and there is no imagery. That
 * line is not squeamishness — it is what keeps this inside a payment
 * processor's acceptable use and inside what the rest of this product sounds
 * like.
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

/**
 * Every limitation, in the order the screen offers them.
 *
 * Here rather than in the screen that used to hold the only copy: the stored
 * answer is validated against it, the search is offered from it, and a fourth
 * caller would have made a fourth list.
 */
export const LIMITATIONS: readonly Limitation[] = [
  'knees',
  'hips',
  'lower-back',
  'shoulders',
  'wrists',
  'neck',
  'pregnancy',
  'limited-mobility',
]

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
}

/**
 * Twenty entries, written rather than generated.
 *
 * It was eight, chosen to cover the range of effort. Twenty is what it takes
 * for every filter on the screen to be worth pressing: at least five entries
 * behind each posture and each effort band, so that somebody who cannot kneel,
 * cannot stand, cannot lie flat, or only wants something light is offered a
 * choice rather than the one thing that happens to qualify. A filter that
 * answers with a single card is a filter that looks broken.
 *
 * `intimacy-search.spec.ts` holds that floor, so the next entry added cannot
 * quietly drop a posture below it. Beyond this a longer list stops being a
 * filter and starts being a catalogue, which is a content decision with a
 * person behind it.
 */
export const INTIMATE_ACTIVITIES: IntimateActivity[] = [
  {
    id: 'facing-side',
    name: 'Side by side, facing',
    description:
      'Both partners lie on their sides facing each other, hips level, legs interleaved so one thigh passes between the other\'s. Neither carries any of the other\'s weight; the mattress takes all of it, which is why this is the arrangement most bodies can still manage on a bad day. Penetration is shallow and the angle barely changes, so it favours slow movement, hands and being face to face over depth or pace. Adjustment comes from sliding the hips a few centimetres up or down rather than from lifting anything.',
    effort: 'light',
    postures: ['lying'],
    facing: true,
    loads: ['core'],
    avoidWith: [],
    suits: ['knees', 'lower-back', 'hips', 'wrists', 'pregnancy', 'limited-mobility'],
    note: 'A pillow under the lower knee takes the last of the load off the hip.',
  },
  {
    id: 'spooning',
    name: 'Side by side, one behind',
    description:
      'Both partners lie on the same side, one tucked behind the other, knees drawn up a little so the hips tilt forward. The partner behind reaches around, which leaves both sets of hands free and means neither spine has to extend or twist. Entry is from behind and stays shallow; depth is set by how far the front partner draws their top knee up. Nothing here asks either back to hold a position, which is why it is the usual first suggestion after a back injury.',
    effort: 'light',
    postures: ['lying'],
    facing: false,
    loads: ['core', 'glutes'],
    avoidWith: [],
    suits: ['lower-back', 'knees', 'shoulders', 'pregnancy', 'limited-mobility'],
    note: 'The most forgiving arrangement for a back that objects to being flexed.',
  },
  {
    id: 'side-crossed',
    name: 'Side by side, crossed',
    description:
      'Both partners lie on their sides at roughly a right angle to each other, legs crossed rather than interleaved, each fully supported by the mattress. Crossing rather than interleaving opens more room between the hips, so it allows deeper contact than the facing version without either person taking weight. Because nobody lies on top of anybody it stays available through a pregnancy and with a back that is healed but cautious. The trade is reach: a poor arrangement for kissing and a good one for hands.',
    effort: 'light',
    postures: ['lying'],
    facing: true,
    loads: ['core'],
    avoidWith: ['hips'],
    suits: ['lower-back', 'knees', 'shoulders', 'neck', 'pregnancy'],
    note: 'Finding the angle takes a minute of shuffling, which is better done before than during.',
  },
  {
    id: 'supine-receiving',
    name: 'On the back, receiving',
    description:
      'One partner lies on their back with knees bent and feet flat; the other is above them, kneeling between their legs or lying along them, carrying their own weight on hands or forearms. The partner underneath does almost nothing, so it costs them very little, and the whole effort sits in the arms and hips of the one above. Depth and pace are the upper partner\'s to set; drawing the lower partner\'s knees towards their chest changes the angle more than anything else available. Full contact and face to face, which is what it is usually chosen for.',
    effort: 'light',
    postures: ['lying', 'kneeling'],
    facing: true,
    loads: ['core'],
    avoidWith: ['pregnancy'],
    suits: ['knees', 'hips', 'limited-mobility'],
    note: 'Late in pregnancy, lying flat on the back is usually uncomfortable; the side arrangements are the alternative.',
  },
  {
    id: 'prone-supported',
    name: 'Face down, supported',
    description:
      'One partner lies face down with a pillow or folded duvet under the hips so the pelvis tilts and the lower back stays long. The other lies or kneels above, taking their own weight on forearms and knees rather than resting it on the person underneath. Entry is from behind and shallow, and the pillow is what sets the angle: without it the receiving partner arches their lower back to compensate and pays for it afterwards. Very little is asked of anybody\'s knees or wrists and nobody has to hold a position.',
    effort: 'light',
    postures: ['lying'],
    facing: false,
    loads: ['core'],
    avoidWith: ['pregnancy', 'neck'],
    suits: ['knees', 'hips', 'wrists', 'limited-mobility'],
    note: 'Turning the head to alternate sides is what keeps the neck out of it over a longer stretch.',
  },
  {
    id: 'supine-legs-supported',
    name: 'On the back, legs supported',
    description:
      'One partner lies on their back and raises their legs to rest against the other\'s chest and shoulders, or into their held hands; the other kneels upright between them. Raising the legs rotates the pelvis and shortens the distance, making this the deepest of the lying arrangements and the one where a few centimetres of leg height change everything. The receiving partner does no work, but their hips and hamstrings are held at length, and that is the limit on how long it stays comfortable rather than any effort. The kneeling partner carries their own weight through the thighs.',
    effort: 'moderate',
    postures: ['lying', 'kneeling'],
    facing: true,
    loads: ['core', 'hamstrings'],
    avoidWith: ['hips', 'lower-back', 'pregnancy'],
    suits: ['knees', 'wrists', 'neck'],
    note: 'How far the legs come up is the whole variable, and they do not have to come up far.',
  },
  {
    id: 'supine-above',
    name: 'On the back, above',
    description:
      'One partner lies flat; the other sits astride them, upright, weight through the shins or the balls of the feet with a knee either side. The person underneath does very little beyond staying still, which is exactly why this is the arrangement most often suggested for a painful back. Whoever is on top has complete control of depth, angle and pace, and leaning forward onto their hands changes all three at once. The cost sits in their quadriceps and knees, and it accumulates rather than arriving.',
    effort: 'moderate',
    postures: ['lying', 'seated'],
    facing: true,
    loads: ['quads', 'glutes', 'core'],
    avoidWith: ['knees', 'hips'],
    suits: ['lower-back', 'shoulders', 'wrists'],
    note: 'The person underneath does very little, which is the point of it for a sore back.',
  },
  {
    id: 'reclined-supported',
    name: 'Half reclined, facing',
    description:
      'One partner sits half upright against a headboard or a stack of pillows rather than lying flat; the other sits astride facing them, resting their weight on their own knees or on the mattress either side. Being propped up puts the two faces at the same height and keeps every hand in play, which makes it the closest of the moderate arrangements. A half-upright spine is kinder to a neck than lying flat and kinder to a lower back than sitting straight, so it is often the compromise when both are complaining. Depth is genuinely shared: either person can change it from their hips.',
    effort: 'moderate',
    postures: ['seated', 'lying'],
    facing: true,
    loads: ['core', 'quads'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'shoulders', 'wrists', 'neck'],
    note: 'Half upright is kinder to a neck than flat and kinder to a back than sitting straight.',
  },
  {
    id: 'seated-facing',
    name: 'Seated, facing',
    description:
      'One partner sits on a firm chair or the edge of a bed with both feet flat on the floor; the other sits astride facing them, feet on the floor or knees on the seat either side. Both spines stay upright and neutral and the floor takes most of the weight, so this is among the least demanding arrangements that still allows full movement. Pace comes from the legs of whoever is astride, or from both rocking together, which is the version that costs least. It is also the most workable arrangement for two people of very different heights.',
    effort: 'moderate',
    postures: ['seated'],
    facing: true,
    loads: ['core', 'quads'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'limited-mobility', 'pregnancy'],
    note: 'A chair with a back to lean against turns this into one of the least demanding options.',
  },
  {
    id: 'seated-supported',
    name: 'Seated, supported behind',
    description:
      'One partner sits with their back against a wall or headboard and legs extended; the other sits astride facing away, taking their weight on their own knees or feet. The wall does the work of holding one spine upright so neither person has to brace, and the partner in front can lean back onto the other\'s chest at any point. Depth and pace belong to whoever is in front, which makes it one of the few arrangements where the person underneath is not the one in control. Facing away suits anybody who finds sustained eye contact effortful, and it leaves the rear partner\'s hands free.',
    effort: 'moderate',
    postures: ['seated'],
    facing: false,
    loads: ['core', 'hamstrings'],
    avoidWith: ['knees'],
    suits: ['shoulders', 'wrists', 'lower-back'],
    note: 'A cushion behind the lower back turns a wall from tolerable into comfortable.',
  },
  {
    id: 'seated-one-behind',
    name: 'Seated, one behind',
    description:
      'Both partners sit on the same firm chair, one on the other\'s lap facing away, feet on the floor and both backs upright. Almost nothing moves: the contact is close and constant rather than driven, which makes this the least effortful arrangement here that is not lying down. No joint is loaded past sitting, and either person can stop without unwinding a position first. It works as an arrangement in its own right and as somewhere to rest partway through something more demanding.',
    effort: 'light',
    postures: ['seated'],
    facing: false,
    loads: ['core'],
    avoidWith: [],
    suits: ['knees', 'lower-back', 'wrists', 'neck', 'limited-mobility'],
    note: 'A chair with arms gives both people something to push against, which is most of the effort gone.',
  },
  {
    id: 'edge-of-bed',
    name: 'At the edge, one standing',
    description:
      'One partner lies on their back with their hips at the very edge of a bed or a table; the other stands at the side with both feet flat on the floor. The height of the surface sets the angle, and when it is right the standing partner works from the hips rather than the knees and can keep going far longer. The partner lying down carries nothing and can put their feet on the floor, on the standing partner\'s shoulders, or anywhere between; that is the adjustment worth experimenting with. It gives a standing partner more control of depth than any arrangement on a mattress does.',
    effort: 'moderate',
    postures: ['lying', 'standing'],
    facing: true,
    loads: ['quads', 'core'],
    avoidWith: ['knees'],
    suits: ['lower-back', 'shoulders', 'wrists', 'limited-mobility'],
    note: 'The height of the bed does the work; a low bed puts all of it back into the standing knees.',
  },
  {
    id: 'kneeling-forward',
    name: 'Kneeling, leaning forward',
    description:
      'One partner kneels and leans forward onto forearms, a stack of pillows or the edge of the bed so the chest sits lower than the hips; the other kneels behind. The forward lean rotates the pelvis, which makes this the deepest arrangement that requires no lifting, and how far the chest goes down is the dial for it. The front partner\'s weight is on their knees and forearms and that is where the cost is; the rear partner\'s is on their knees. One hand stays free on each side.',
    effort: 'moderate',
    postures: ['kneeling'],
    facing: false,
    loads: ['glutes', 'core', 'shoulders'],
    avoidWith: ['knees', 'wrists'],
    suits: ['lower-back', 'pregnancy'],
    note: 'Forearms rather than hands keeps the wrists out of it entirely.',
  },
  {
    id: 'kneeling-facing',
    name: 'Kneeling, upright, facing',
    description:
      'Both partners kneel upright facing each other, thighs vertical, so the two bodies are in contact from knees to chest with every hand free. Nothing is penetrative unless one partner sits back onto their heels or the other lowers, which is why it works as the arrangement people use to stay close and slow rather than to finish. Height difference is the constraint, and a substantial one has to be solved with a cushion under somebody\'s knees rather than endured. Thighs and glutes hold the whole position and they will say so within a few minutes.',
    effort: 'moderate',
    postures: ['kneeling'],
    facing: true,
    loads: ['quads', 'glutes', 'core'],
    avoidWith: ['knees', 'hips'],
    suits: ['lower-back', 'wrists', 'neck'],
    note: 'A folded blanket under both pairs of knees changes this more than anything else on the list.',
  },
  {
    id: 'leaning-support',
    name: 'Standing, leaning on a support',
    description:
      'One partner stands and leans forward onto a table, a sofa back or a chest of drawers, hands or forearms carrying the upper body; the other stands behind them. Height decides whether this works at all: a support at hip height keeps the leaning spine long, and one much lower folds it. Both partners stay on their feet, so the cost is in the legs rather than in anybody\'s knees, and it needs less setup and less furniture than any other standing arrangement. The rear partner controls depth and pace; the front partner\'s contribution is limited to pushing back.',
    effort: 'moderate',
    postures: ['standing'],
    facing: false,
    loads: ['glutes', 'core', 'shoulders'],
    avoidWith: ['lower-back', 'limited-mobility'],
    suits: ['knees', 'wrists', 'neck'],
    note: 'The support wants to be high enough that the back stays long rather than folded.',
  },
  {
    id: 'standing-braced',
    name: 'Standing, braced',
    description:
      'Both partners stand, one braced against a wall or a door frame with hands or forearms, feet apart and knees soft. Nothing supports either body but its own legs, which is what puts this at the demanding end for quadriceps and calves. Height difference matters more here than in any other arrangement, and one partner rising onto their toes is not a solution that survives a minute. It is short by nature and works as part of something rather than as all of it.',
    effort: 'vigorous',
    postures: ['standing'],
    facing: false,
    loads: ['quads', 'glutes', 'calves', 'core'],
    avoidWith: ['knees', 'hips', 'lower-back', 'limited-mobility'],
    suits: ['wrists'],
    note: 'The most demanding of these on the legs, and the one a tired pair of quads will notice.',
  },
  {
    id: 'kneeling-supporting',
    name: 'Kneeling, one supported astride',
    description:
      'One partner kneels upright and takes the other across their thighs; the other sits astride with their legs around the kneeling partner\'s waist and arms over their shoulders. The kneeling partner is holding most of another person\'s weight with their thighs and core while also moving, which is what puts this at the top of the effort range. What it buys is the closest and most face-to-face of the vigorous arrangements, and the one where both partners move together rather than one driving. Neither person can hold it long, and it is better for that.',
    effort: 'vigorous',
    postures: ['kneeling', 'seated'],
    facing: true,
    loads: ['quads', 'glutes', 'core', 'shoulders'],
    avoidWith: ['knees', 'lower-back', 'hips', 'pregnancy'],
    suits: ['wrists', 'neck'],
    note: 'A folded blanket under the kneeling pair of knees is what makes it holdable for more than a moment.',
  },
  {
    id: 'supine-above-feet',
    name: 'On the back, above, on the feet',
    description:
      'One partner lies on their back; the other crouches astride with both feet flat on the mattress rather than kneeling, hands on their partner\'s chest or on the bed for balance. Being on the feet rather than the shins gives the upper partner full range and complete control of depth and pace, which is the reason to choose it over the version on the knees. It is a held deep squat, so quadriceps, glutes and calves work continuously, and a soft mattress makes that harder rather than easier. The partner underneath does nothing at all.',
    effort: 'vigorous',
    postures: ['lying', 'standing'],
    facing: true,
    loads: ['quads', 'glutes', 'calves', 'core'],
    avoidWith: ['knees', 'hips', 'limited-mobility'],
    suits: ['lower-back', 'shoulders', 'wrists', 'neck'],
    note: 'A deep squat held for any length of time is a leg exercise; the same arrangement on the shins is not.',
  },
  {
    id: 'standing-leg-raised',
    name: 'Standing, facing, one leg supported',
    description:
      'Both partners stand facing each other and one raises a foot onto a step, a chair, a bed frame or the edge of the bath, which opens the hip and changes the angle; the other steadies them at the waist or under the raised thigh. The height the foot goes on is the whole difficulty: knee height is manageable, hip height is a stretch nobody should be holding while distracted. Whoever is on one leg is balancing as well as moving, so a free hand on a wall is worth more than it sounds. Face to face throughout, which few standing arrangements manage.',
    effort: 'vigorous',
    postures: ['standing'],
    facing: true,
    loads: ['quads', 'glutes', 'calves', 'core'],
    avoidWith: ['hips', 'knees', 'limited-mobility'],
    suits: ['wrists', 'neck'],
    note: 'The height of whatever the foot goes on is the whole difficulty; a low step asks far less of the hip.',
  },
  {
    id: 'standing-supported',
    name: 'Standing, one carried against a wall',
    description:
      'One partner stands and carries the other, who has their back against a wall and their legs wrapped around the standing partner\'s hips; the wall takes the weight the arms would otherwise hold entirely. Even with the wall this is one person supporting another\'s whole body while moving, so it asks more of the legs, the back and the grip than anything else here. Both people are working: the carried partner holds their own position with their thighs and arms rather than hanging. It is measured in seconds to a minute, and treating it as longer is how people get hurt.',
    effort: 'vigorous',
    postures: ['standing'],
    facing: true,
    loads: ['quads', 'glutes', 'core', 'shoulders'],
    avoidWith: ['lower-back', 'knees', 'hips', 'shoulders', 'wrists', 'limited-mobility', 'pregnancy'],
    suits: [],
    note: 'The most demanding arrangement on this list by a distance, and the wall is not optional.',
  },
]
