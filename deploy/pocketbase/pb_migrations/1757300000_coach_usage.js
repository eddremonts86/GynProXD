/// <reference path="../pb_data/types.d.ts" />
/**
 * What the coach costs, one row per call.
 *
 * The question that prompted this was "is the flat rate we pay cheap or dear?",
 * and it could not be answered: nothing recorded how many programmes get
 * designed or how many tokens each one spends. A month of these rows answers it
 * arithmetically instead of by feel, and answers the next one too — whether a
 * cheaper model is actually cheaper once its extra retries are counted.
 *
 * Deliberately not a bucket table like builderhunt's. Programme design is rare
 * — a handful per member per year — so there is nothing to aggregate away, and a
 * row per call keeps the one thing an average destroys: the shape of the tail.
 * A model that is fine on median and terrible on p95 is exactly the model whose
 * bill surprises you.
 *
 * `owner` is a relation so a member's rows leave with their account, and no
 * prompt or completion text is stored — this is a meter, not a transcript. What
 * somebody wrote about their knee already travels further than it should; it is
 * not also going to sit in a table nobody remembers is there.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')

    const usage = new Collection({
      type: 'base',
      name: 'coach_usage',
      /* Readable only by platform admins, through the same collection check the
         recipe admin routes use. A member has no use for this and it says which
         vendor answers, which is nobody's business by default. */
      listRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      viewRule: "@request.auth.id != '' && @collection.platform_admins.owner ?= @request.auth.id",
      /* Written by the coach proxy with a privileged save, never through the API:
         a client that could write here could invent a bill. */
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: 'owner',
          type: 'relation',
          required: false,
          collectionId: users.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* The model that answered, as the provider named it back — not what was
           asked for. Those differ when a provider silently substitutes, and the
           substitution is the interesting part. */
        { name: 'model', type: 'text', required: false, max: 80 },
        /* The vendor's host, so a bill can be split when more than one answers. */
        { name: 'host', type: 'text', required: false, max: 120 },
        { name: 'input_tokens', type: 'number', required: false },
        { name: 'output_tokens', type: 'number', required: false },
        /* Wall clock for the call. A cheap model that takes four minutes is not
           cheap; it is a member watching a spinner. */
        { name: 'ms', type: 'number', required: false },
        { name: 'status', type: 'number', required: false },
        /* False when the answer came back but could not be used. A retry costs
           tokens twice and shows up here twice, which is the whole point. */
        { name: 'ok', type: 'bool', required: false },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX `idx_coach_usage_created` ON `coach_usage` (`created`)'],
    })
    app.save(usage)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('coach_usage'))
    } catch {
      /* already gone */
    }
  },
)
