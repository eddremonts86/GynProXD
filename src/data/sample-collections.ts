import type { Collection } from '../lib/collection'

/**
 * Bundled collections, available before any gym curates one. Editorial
 * selections from the bundled catalogue, shaped by circumstance rather
 * than by muscle group.
 *
 * Order is the order of the rail, and it reads as one sentence: where you are
 * first — a desk, a bare floor, a living room, one pair of dumbbells, a gym —
 * then what you came to work on. A member scanning the rail is answering the
 * first question before they know the answer to the second.
 *
 * Each of these is a short curated list, not a filter. The page already has an
 * equipment dropdown, and a collection that only restates it is a second copy
 * of the same rule waiting to disagree with the first: nine dumbbell movements
 * that cover a whole body is a different object from 123 results in alphabetical
 * order, and only the first one is worth a chip.
 */
export const SAMPLE_COLLECTIONS: Collection[] = [
  {
    id: 'sample-desk',
    name: 'Desk worker',
    blurb: 'Undo eight hours in a chair: open the hips, unlock the shoulders, wake the glutes.',
    exerciseIds: [
      'Chair_Upper_Body_Stretch',
      'Chair_Lower_Back_Stretch',
      'Standing_Hip_Flexors',
      'Cat_Stretch',
      'Face_Pull',
      'Butt_Lift_Bridge',
      'Isometric_Neck_Exercise_-_Sides',
    ],
    source: 'bundled',
  },
  {
    id: 'sample-no-equipment',
    name: 'Nothing but the floor',
    blurb: 'Everything here needs a body and some space. Travel, a full gym, a living room.',
    exerciseIds: [
      'Pushups',
      'Bodyweight_Squat',
      'Plank',
      'Sit-Up',
      'Bodyweight_Walking_Lunge',
      'Butt_Lift_Bridge',
    ],
    source: 'bundled',
  },
  {
    /**
     * Kept distinct from `sample-no-equipment` on purpose, and the difference is
     * not pedantry: that one answers "I have nothing", this one answers "I have
     * what I keep at home". A pair of dumbbells and a band change what a living
     * room can do, and collapsing the two would lose whichever half of the
     * membership is not being spoken to.
     */
    id: 'sample-home',
    name: 'At home',
    blurb: 'A living room, a pair of dumbbells, a band. No commute, no waiting for a rack.',
    exerciseIds: [
      'Pushups',
      'Bodyweight_Squat',
      'Bodyweight_Walking_Lunge',
      'Dumbbell_Shoulder_Press',
      'Bent_Over_Two-Dumbbell_Row',
      'Plank',
      'Butt_Lift_Bridge',
      'Band_Hip_Adductions',
    ],
    source: 'bundled',
  },
  {
    /**
     * One pair of dumbbells, every major pattern: push, pull, squat, hinge,
     * carry-adjacent, and the two smaller ones people actually miss. Chosen so
     * the list stands alone as a session rather than as a shelf of options.
     */
    id: 'sample-dumbbells',
    name: 'Dumbbells only',
    blurb: 'One pair, whole body. Push, pull, squat, hinge — nothing else required.',
    exerciseIds: [
      'Dumbbell_Shoulder_Press',
      'Dumbbell_Bench_Press',
      'Bent_Over_Two-Dumbbell_Row',
      'Dumbbell_Squat',
      'Dumbbell_Lunges',
      'Stiff-Legged_Dumbbell_Deadlift',
      'Dumbbell_Floor_Press',
      'Dumbbell_Bicep_Curl',
      'Standing_Dumbbell_Calf_Raise',
    ],
    source: 'bundled',
  },
  {
    id: 'sample-back-at-it',
    name: 'Back at the gym',
    blurb: 'A gentle re-entry after time away: simple patterns, easy to load, easy to stop.',
    exerciseIds: [
      'Chair_Squat',
      'Dumbbell_Bench_Press',
      'Reverse_Flyes',
      'Standing_Hip_Circles',
      'Walking_Treadmill',
      'Seated_Overhead_Stretch',
    ],
    source: 'bundled',
  },
  {
    /**
     * Named for the work rather than for who is expected to want it. The
     * catalogue carries muscle and equipment and nothing else, so any collection
     * addressed to a person is a curated list either way — and a name that
     * describes its contents is findable by everyone who wants that contents.
     */
    id: 'sample-glutes-hips',
    name: 'Glutes & hips',
    blurb: 'Bridges, thrusts and hinges. The work most programmes leave until last.',
    exerciseIds: [
      'Barbell_Hip_Thrust',
      'Butt_Lift_Bridge',
      'Single_Leg_Glute_Bridge',
      'Glute_Kickback',
      'Band_Hip_Adductions',
      'Bodyweight_Squat',
      'Bodyweight_Walking_Lunge',
      'Lying_Glute',
    ],
    source: 'bundled',
  },
  {
    /**
     * Deliberately not called pelvic floor, and not called postpartum.
     *
     * Those were the honest names for what was asked for, and this catalogue
     * cannot pay for either: a search across all 1,322 movements returns five in
     * that territory, none of them a pelvic floor exercise. What is here is deep
     * core, breathing and lumbar control — real work, useful for coming back
     * from a pause, and the kind of thing someone recovering may well be sent
     * to. Promising rehabilitation on a chip that delivers a dead bug is the one
     * version of this that would be wrong.
     */
    id: 'sample-core-control',
    name: 'Core and control',
    blurb: 'Breathing, bracing and the small muscles that hold a spine still. Start here after a pause.',
    exerciseIds: [
      'Dead_Bug',
      'Stomach_Vacuum',
      'Pelvic_Tilt_Into_Bridge',
      'Standing_Pelvic_Tilt',
      'Cat_Stretch',
      'Plank',
      'Side_Bridge',
      'Bent-Knee_Hip_Raise',
    ],
    source: 'bundled',
  },
  {
    /**
     * The one collection here named for who it is for rather than for the
     * circumstance it meets, which is a departure from the rule at the top of
     * `collection.ts` and is recorded as such. It is a balanced whole-body list;
     * what makes it this collection is the name on the chip, not the
     * programming. `sample-glutes-hips` and `sample-core-control` are where the
     * substance of the same request lives.
     */
    id: 'sample-women',
    name: 'For women',
    blurb: 'A balanced whole-body week: press, pull, squat, hinge, brace.',
    exerciseIds: [
      'Bodyweight_Squat',
      'Bodyweight_Walking_Lunge',
      'Butt_Lift_Bridge',
      'Dumbbell_Shoulder_Press',
      'Bent_Over_Two-Dumbbell_Row',
      'Pushups',
      'Plank',
      'Dead_Bug',
    ],
    source: 'bundled',
  },
]
