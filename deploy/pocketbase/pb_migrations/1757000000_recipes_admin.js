/// <reference path="../pb_data/types.d.ts" />
/**
 * Recipes the gym writes itself. `house` rows are ours: no vendor terms, no
 * 24h clock, kept like the public-domain ones. Platform admins get direct
 * access to the collection so the panel can use PocketBase's own record API
 * (file upload included); `recipes_admin.pb.js` is what checks that what they
 * write is complete. Everyone else still reads through the hooks only.
 */
const IS_ADMIN =
  "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id"

migrate(
  (app) => {
    const recipes = app.findCollectionByNameOrId('recipes')
    const provider = recipes.fields.getByName('provider')
    provider.values = ['pd', 'fatsecret', 'house']

    recipes.listRule = IS_ADMIN
    recipes.viewRule = IS_ADMIN
    recipes.createRule = IS_ADMIN
    recipes.updateRule = IS_ADMIN
    recipes.deleteRule = IS_ADMIN
    app.save(recipes)
  },
  (app) => {
    const recipes = app.findCollectionByNameOrId('recipes')
    const provider = recipes.fields.getByName('provider')
    provider.values = ['pd', 'fatsecret']

    recipes.listRule = null
    recipes.viewRule = null
    recipes.createRule = null
    recipes.updateRule = null
    recipes.deleteRule = null
    app.save(recipes)
  },
)
