/// <reference path="../pb_data/types.d.ts" />
/**
 * Gatekeeping for recipes the gym writes itself. The same checks run on create
 * and on update, because an edit can empty a field just as easily as a bad
 * create can. The rules live in utils/recipe_validate.js: each handler runs in
 * its own VM and sees nothing from this file's top level.
 */

onRecordCreateRequest((e) => {
  require(`${__hooks}/utils/recipe_validate.js`).validateRecipe(e)
  e.next()
}, 'recipes')

onRecordUpdateRequest((e) => {
  require(`${__hooks}/utils/recipe_validate.js`).validateRecipe(e)
  e.next()
}, 'recipes')
