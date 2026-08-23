import type { Exercise } from '../lib/types'

const e = (
  id: string,
  name: string,
  muscle: Exercise['muscle'],
  equipment: Exercise['equipment'],
): Exercise => ({ id, name, muscle, equipment })

export const seedExercises: Exercise[] = [
  e('bench-press', 'Barbell Bench Press', 'chest', 'barbell'),
  e('incline-db-press', 'Incline Dumbbell Press', 'chest', 'dumbbell'),
  e('push-up', 'Push-Up', 'chest', 'bodyweight'),
  e('cable-fly', 'Cable Fly', 'chest', 'cable'),
  e('deadlift', 'Deadlift', 'back', 'barbell'),
  e('pull-up', 'Pull-Up', 'back', 'bodyweight'),
  e('barbell-row', 'Barbell Row', 'back', 'barbell'),
  e('lat-pulldown', 'Lat Pulldown', 'back', 'machine'),
  e('ohp', 'Overhead Press', 'shoulders', 'barbell'),
  e('lateral-raise', 'Dumbbell Lateral Raise', 'shoulders', 'dumbbell'),
  e('db-curl', 'Dumbbell Biceps Curl', 'biceps', 'dumbbell'),
  e('hammer-curl', 'Hammer Curl', 'biceps', 'dumbbell'),
  e('tricep-pushdown', 'Tricep Pushdown', 'triceps', 'cable'),
  e('skullcrusher', 'Skullcrusher', 'triceps', 'barbell'),
  e('squat', 'Back Squat', 'quads', 'barbell'),
  e('leg-press', 'Leg Press', 'quads', 'machine'),
  e('rdl', 'Romanian Deadlift', 'hamstrings', 'barbell'),
  e('leg-curl', 'Lying Leg Curl', 'hamstrings', 'machine'),
  e('hip-thrust', 'Hip Thrust', 'glutes', 'barbell'),
  e('calf-raise', 'Standing Calf Raise', 'calves', 'machine'),
  e('plank', 'Plank', 'core', 'bodyweight'),
  e('hanging-leg-raise', 'Hanging Leg Raise', 'core', 'bodyweight'),
]
