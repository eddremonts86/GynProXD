/// <reference path="../pb_data/types.d.ts" />
/**
 * The two halves of the gym relationship that never crossed the wire.
 *
 * `gym_menus` carries the standing kitchen card. It was written by the
 * operator's editor straight into that browser's localStorage and stayed
 * there, so the priced card on Today — the one surface in this app that leads
 * anywhere money changes hands — could only ever appear on the gym's own
 * machine. Members saw the free public recipe instead.
 *
 * `gym_responses` carries the answer back. Going, saved and reserved were
 * local too, which meant the gym's reach panel summed arrays that could only
 * hold that same device's clicks: structural zeroes, not "nobody came". A gym
 * that cannot see what publishing bought does not renew, and this is the
 * paying side of the product.
 *
 * One row per member per message, upserted: an event answer, an offer put
 * aside, an item held at the desk, a challenge taken up, and whether it was
 * opened at all. `member_name` is denormalised on purpose — a guest list of
 * user ids is not a guest list.
 */
const AUTHED = "@request.auth.id != ''"

migrate(
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    const messages = app.findCollectionByNameOrId('gym_messages')

    /* Same audience as the bus: the gym's own members, and its operators. */
    const menuRead = `${AUTHED} && (gym = @request.auth.gym || gym.operators.id ?= @request.auth.id)`

    const menus = new Collection({
      type: 'base',
      name: 'gym_menus',
      listRule: menuRead,
      viewRule: menuRead,
      /* "You operate this gym" needs the draft's relations, which a create
         rule cannot follow; the companion hook enforces it for both writes. */
      createRule: AUTHED,
      updateRule: AUTHED,
      deleteRule: `${AUTHED} && gym.operators.id ?= @request.auth.id`,
      fields: [
        {
          name: 'gym',
          type: 'relation',
          required: true,
          collectionId: gyms.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* The whole card, replaced wholesale on save — the editor has no
           concept of a partial update and neither should the row. */
        { name: 'sections', type: 'json', maxSize: 60000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX `idx_gym_menus_gym` ON `gym_menus` (`gym`)'],
    })
    app.save(menus)

    /* A member reads and writes their own answer; the gym reads every answer
       to its own messages, and can write none of them. */
    const responseRead =
      `${AUTHED} && (owner = @request.auth.id || message.gym.operators.id ?= @request.auth.id)`
    const mine = `${AUTHED} && owner = @request.auth.id`

    const responses = new Collection({
      type: 'base',
      name: 'gym_responses',
      listRule: responseRead,
      viewRule: responseRead,
      createRule: `${AUTHED} && @request.body.owner = @request.auth.id`,
      updateRule: mine,
      deleteRule: mine,
      fields: [
        {
          name: 'message',
          type: 'relation',
          required: true,
          collectionId: messages.id,
          cascadeDelete: true,
          maxSelect: 1,
        },
        {
          name: 'owner',
          type: 'relation',
          required: true,
          collectionId: '_pb_users_auth_',
          cascadeDelete: true,
          maxSelect: 1,
        },
        /* '', 'yes' or 'no'. Empty is a member who read an event and did not
           answer, which is not the same as declining. */
        { name: 'answer', type: 'text', max: 3 },
        { name: 'saved', type: 'bool' },
        { name: 'joined', type: 'bool' },
        { name: 'opened', type: 'bool' },
        { name: 'member_name', type: 'text', max: 80 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX `idx_gym_responses_message_owner` ON `gym_responses` (`message`, `owner`)',
      ],
    })
    app.save(responses)
  },
  (app) => {
    for (const name of ['gym_responses', 'gym_menus']) {
      try {
        app.delete(app.findCollectionByNameOrId(name))
      } catch {
        /* already gone */
      }
    }
  },
)
