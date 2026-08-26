import type { Challenge } from '../lib/challenge'

/**
 * Bundled challenges, available before any gym publishes one. Editorial
 * numbers: the countdown front-loads the hard days while motivation is
 * high; the ascents build a habit one rep (or five seconds) at a time.
 * Exercise ids reference the bundled catalogue.
 */
export const SAMPLE_CHALLENGES: Challenge[] = [
  {
    id: 'sample-squat-countdown',
    name: 'Squat Countdown',
    exerciseId: 'Bodyweight_Squat',
    days: 30,
    start: 30,
    delta: -1,
    unit: 'reps',
    blurb: 'Thirty squats on day one, one on day thirty. It only gets easier.',
  },
  {
    id: 'sample-pushup-ladder',
    name: 'Push-Up Ladder',
    exerciseId: 'Pushups',
    days: 30,
    start: 10,
    delta: 1,
    unit: 'reps',
    blurb: 'One more push-up every day. Split them through the day if you need to.',
  },
  {
    id: 'sample-plank-builder',
    name: 'Plank Builder',
    exerciseId: 'Plank',
    days: 30,
    start: 30,
    delta: 5,
    unit: 'seconds',
    blurb: 'From thirty seconds to nearly three minutes, five seconds at a time.',
  },
  {
    id: 'sample-situp-climb',
    name: 'Sit-Up Climb',
    exerciseId: 'Sit-Up',
    days: 30,
    start: 15,
    delta: 1,
    unit: 'reps',
    blurb: 'A steady climb for your core: fifteen to forty-four in a month.',
  },
]
