/// <reference path="../pb_data/types.d.ts" />
/**
 * An area on the open door, and the promise that had to change to allow it.
 *
 * Until now `/for-gyms` said, in these words: "there is no location filter. We
 * hold no location for anybody, and we would rather say so than imply a
 * segmentation that does not exist." That was true and it was worth saying. It
 * is no longer what the product does, and a page that keeps a promise the code
 * has stopped keeping is worse than one that never made it.
 *
 * What changes, exactly:
 *
 * - `users.area` is a member's own line about where they train. Optional, empty
 *   for everybody who does not fill it in, and lower-cased on write so "Lisboa"
 *   and "lisboa " are one place rather than two.
 * - `gym_messages.area` is the area a gym aims an open-door message at. Empty
 *   means everybody, which is what every message written before today is.
 *
 * What deliberately does **not** change: a gym still cannot learn who is in the
 * audience. The filter is another arm of the read rule, evaluated on the server
 * against the reader's own row, so a gym names a place and never finds out
 * whether one person or four hundred are in it. The one fact it would most like
 * to have is still the one it does not get.
 *
 * The member's area is readable only by the member: `users` is
 * `id = @request.auth.id` and this adds a field to that row rather than a new
 * collection with rules of its own.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(new Field({ name: 'area', type: 'text', max: 60 }))
    app.save(users)

    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.fields.add(new Field({ name: 'area', type: 'text', max: 60 }))

    /* The open-door arm gains the filter. `area = ''` first so an existing
       message, and any message a gym does not aim, still reaches everybody:
       the field arrives empty on several hundred rows and none of them should
       stop being delivered by a migration. */
    /* Built on the rule 1758100000 left, not the one before it. Rewriting this
       from the open-door version dropped the scheduling arms and made every
       queued message readable before its time, which is what
       `scheduled-boundary` caught the moment it ran. */
    const due = "(publish_at = '' || publish_at <= @now)"
    const readRule = [
      "@request.auth.id != '' &&",
      '(',
      'gym.operators.id ?= @request.auth.id',
      `|| (gym = @request.auth.gym && ${due})`,
      `|| (gym.kind = 'house' && scope = 'everyone' && ${due})`,
      "|| (gym.kind = 'house' && scope = 'unaffiliated' && @request.auth.gym = ''",
      `&& @collection.gyms.operators.id != @request.auth.id && ${due})`,
      "|| (scope = 'open-door' && @request.auth.gym = ''",
      '&& @request.auth.closed_to_gyms = false',
      `&& @collection.gyms.operators.id != @request.auth.id && ${due}`,
      "&& (area = '' || area = @request.auth.area))",
      ')',
    ].join(' ')
    messages.listRule = readRule
    messages.viewRule = readRule
    app.save(messages)
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    /* Back to exactly the rule 1758100000 left, scheduling arms and all. */
    const due = "(publish_at = '' || publish_at <= @now)"
    const readRule = [
      "@request.auth.id != '' &&",
      '(',
      'gym.operators.id ?= @request.auth.id',
      `|| (gym = @request.auth.gym && ${due})`,
      `|| (gym.kind = 'house' && scope = 'everyone' && ${due})`,
      "|| (gym.kind = 'house' && scope = 'unaffiliated' && @request.auth.gym = ''",
      `&& @collection.gyms.operators.id != @request.auth.id && ${due})`,
      "|| (scope = 'open-door' && @request.auth.gym = ''",
      '&& @request.auth.closed_to_gyms = false',
      `&& @collection.gyms.operators.id != @request.auth.id && ${due})`,
      ')',
    ].join(' ')
    messages.listRule = readRule
    messages.viewRule = readRule
    messages.fields.removeByName('area')
    app.save(messages)

    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('area')
    app.save(users)
  },
)
