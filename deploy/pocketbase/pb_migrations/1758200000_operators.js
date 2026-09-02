/// <reference path="../pb_data/types.d.ts" />
/**
 * Staff who can publish.
 *
 * `gyms.operators` has existed since the bus was built, and until now only a
 * superuser could edit it — so a gym was one person's phone, and the day that
 * person was off, nothing got posted. This gives the roster to the gym.
 *
 * **There is an owner, and only the owner changes the roster.** Without one,
 * every operator can edit `operators`, which means an invited operator can
 * remove the person who invited them — and the gym's account is then held by
 * whoever moved first. The owner is the account the gym was provisioned to;
 * existing gyms are backfilled from the first entry in their operators list,
 * which is how the provisioning script has always filled it.
 *
 * **Invitations are rows, not lookups.** The obvious build is "type an email,
 * we add that account" — which answers, for anybody with a gym, whether any
 * given address has an enForma account. That is an enumeration oracle handed to
 * every customer. So an invitation is written for the address whether or not it
 * exists, the panel says the same thing either way, and it is claimed when
 * somebody signs in with that address.
 *
 * The cap lives on the plan: see utils/operators.js.
 */
migrate(
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    const users = app.findCollectionByNameOrId('users')

    gyms.fields.add(
      new Field({
        name: 'owner',
        type: 'relation',
        collectionId: users.id,
        cascadeDelete: false,
        maxSelect: 1,
      }),
    )
    app.save(gyms)

    for (const gym of app.findAllRecords('gyms')) {
      /* The house has no owner and no roster to hand over. */
      if (gym.get('kind') === 'house') continue
      const operators = gym.get('operators') || []
      if (operators.length > 0) {
        gym.set('owner', operators[0])
        app.save(gym)
      }
    }

    const invites = new Collection({
      type: 'base',
      name: 'gym_invites',
      /**
       * Read by the gym's own operators, so the panel can list who is pending.
       * Deliberately not readable by the invited address: an invitation is the
       * gym's record of an intention, and until it is claimed there is nobody
       * to show it to.
       */
      listRule: "@request.auth.id != '' && gym.operators.id ?= @request.auth.id",
      viewRule: "@request.auth.id != '' && gym.operators.id ?= @request.auth.id",
      /* Written through the endpoint, which checks the owner and the cap. */
      createRule: null,
      updateRule: null,
      deleteRule: "@request.auth.id != '' && gym.owner = @request.auth.id",
      fields: [
        {
          name: 'gym',
          type: 'relation',
          required: true,
          collectionId: gyms.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* Stored lowercased by the endpoint, because an address is the same
           address whatever case somebody typed it in. */
        { name: 'email', type: 'email', required: true },
        {
          name: 'invited_by',
          type: 'relation',
          required: true,
          collectionId: users.id,
          cascadeDelete: false,
          maxSelect: 1,
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: [
        /* One standing invitation per address per gym. Inviting somebody twice
           is not two invitations for the desk to reconcile. */
        'CREATE UNIQUE INDEX `idx_gym_invites_one` ON `gym_invites` (`gym`, `email`)',
        'CREATE INDEX `idx_gym_invites_email` ON `gym_invites` (`email`)',
      ],
    })
    app.save(invites)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('gym_invites'))
    } catch {
      /* already gone */
    }
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.removeByName('owner')
    app.save(gyms)
  },
)
