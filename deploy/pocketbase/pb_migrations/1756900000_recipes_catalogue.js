/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 8 storage: the app's own recipe catalogue. `pd` rows are public
 * domain content we keep forever (USDA MyPlate import); `fatsecret` rows are
 * a rolling cache — their terms make only IDs storable indefinitely, so
 * `fetchedAt` plus the nightly job in recipes.pb.js refresh or delete
 * anything older than 24h. Hooks read and write privileged; clients never
 * touch the collection directly.
 */
migrate(
  (app) => {
    const recipes = new Collection({
      type: 'base',
      name: 'recipes',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'provider', type: 'select', required: true, maxSelect: 1, values: ['pd', 'fatsecret'] },
        { name: 'providerId', type: 'text', required: true, max: 200 },
        { name: 'title', type: 'text', required: true, max: 300 },
        {
          name: 'image',
          type: 'file',
          maxSelect: 1,
          maxSize: 3000000,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        },
        { name: 'imageUrl', type: 'text', max: 1000 },
        { name: 'kcal', type: 'number' },
        { name: 'proteinG', type: 'number' },
        { name: 'carbsG', type: 'number' },
        { name: 'fatG', type: 'number' },
        { name: 'servings', type: 'number' },
        { name: 'readyInMinutes', type: 'number' },
        { name: 'category', type: 'text', max: 40 },
        { name: 'sourceCategory', type: 'text', max: 200 },
        { name: 'directions', type: 'json', maxSize: 100000 },
        { name: 'ingredients', type: 'json', maxSize: 100000 },
        { name: 'sourceUrl', type: 'text', max: 1000 },
        { name: 'fetchedAt', type: 'date' },
        { name: 'usedAt', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_recipes_provider_pid` ON `recipes` (`provider`, `providerId`)',
        'CREATE INDEX `idx_recipes_kcal` ON `recipes` (`kcal`)',
        'CREATE INDEX `idx_recipes_protein` ON `recipes` (`proteinG`)',
        'CREATE INDEX `idx_recipes_category` ON `recipes` (`category`)',
      ],
    })
    app.save(recipes)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('recipes'))
  },
)
