/// <reference path="../pb_data/types.d.ts" />
/**
 * Gatekeeping for movements the platform writes itself. The rules live in
 * utils/exercise_validate.js: each handler runs in its own VM and sees nothing
 * from this file's top level, so the require goes inside.
 */

onRecordCreateRequest((e) => {
  require(`${__hooks}/utils/exercise_validate.js`).validateExercise(e)
  e.next()
}, 'exercises')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/utils/exercise_validate.js`).validateExercise(e)
  e.next()
}, 'exercises')
