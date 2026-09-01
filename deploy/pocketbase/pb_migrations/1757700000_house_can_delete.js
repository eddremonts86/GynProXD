/// <reference path="../pb_data/types.d.ts" />
/**
 * The house could publish and could never unpublish.
 *
 * `1757600000_house_gym.js` moved the right to publish from a gym's `operators`
 * list to `platform_admins`, so that granting somebody admin grants it and
 * there is no second list to keep in step. It left `deleteRule` alone, and that
 * rule asks the question the old way:
 *
 *     gym.operators.id ?= @request.auth.id
 *
 * The house's operators list is empty on purpose, so the answer for a house
 * message is always no — for everybody, admins included. Every gym could take
 * back something it had said; the platform could not take back anything.
 *
 * Found by using it. A release check published a message to production and the
 * delete that was meant to follow it came back 404, which is what PocketBase
 * returns when a rule refuses rather than when a row is missing — so it read as
 * "already gone" for a moment, and the row was still there.
 *
 * The new arm mirrors the create hook's authority exactly: the house answers to
 * platform admins, a gym answers to its operators, and neither reaches the
 * other's messages.
 */
migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.deleteRule = [
      "@request.auth.id != '' &&",
      '(',
      'gym.operators.id ?= @request.auth.id',
      "|| (gym.kind = 'house' && @collection.platform_admins.owner ?= @request.auth.id)",
      ')',
    ].join(' ')
    app.save(messages)
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.deleteRule = "@request.auth.id != '' && gym.operators.id ?= @request.auth.id"
    app.save(messages)
  },
)
