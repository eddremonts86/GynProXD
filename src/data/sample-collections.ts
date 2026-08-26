import type { Collection } from '../lib/collection'

/**
 * Bundled collections, available before any gym curates one. Editorial
 * selections from the bundled catalogue, shaped by circumstance rather
 * than by muscle group.
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
]
