/// <reference path="../pb_data/types.d.ts" />
/**
 * A join request carries the requester's name and email on the record itself.
 * The operator must know who is asking, but the users collection is readable
 * only by its owner (viewRule id = self), so an expand cannot reach it. The
 * requester writes their own identity here — no cross-user exposure, since it
 * is their own request — and the operator reads it directly.
 */
migrate(
  (app) => {
    const requests = app.findCollectionByNameOrId('gym_join_requests')
    requests.fields.add(new Field({ name: 'member_name', type: 'text', max: 80 }))
    requests.fields.add(new Field({ name: 'member_email', type: 'text', max: 200 }))
    app.save(requests)
  },
  (app) => {
    const requests = app.findCollectionByNameOrId('gym_join_requests')
    requests.fields.removeByName('member_name')
    requests.fields.removeByName('member_email')
    app.save(requests)
  },
)
