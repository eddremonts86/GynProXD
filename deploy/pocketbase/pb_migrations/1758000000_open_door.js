/// <reference path="../pb_data/types.d.ts" />
/**
 * The open door: a Plus gym reaching people who belong to no gym.
 *
 * Everything else in `gym_messages` travels inside a relationship somebody
 * already chose — you joined this gym, so this gym may write to you. This is
 * the one message that does not, and it is the only thing on the Plus tier that
 * wins a gym a member it did not already have. Which is exactly why it needs
 * more rules than the rest of them put together.
 *
 * Three decisions are worth stating because they are the ones somebody will
 * later wonder about:
 *
 * **A scope of its own, not `unaffiliated`.** The house already reaches this
 * audience under that name, and `senderOf` attributes anything that is not
 * `members` to the platform. A gym's offer arriving over the name "enForma"
 * would be a lie and would lend the platform's credibility to whoever paid for
 * it. `open-door` reads as the gym, because it is the gym.
 *
 * **`users.closed_to_gyms`, phrased as the refusal.** The setting defaults to
 * on — nothing about a member flows to the gym here, since the audience is a
 * scope evaluated on the server and no gym ever learns that any particular
 * person has no gym, so what the switch governs is whether unsolicited messages
 * arrive at all: a notification preference rather than a disclosure. Defaulting
 * it off would ship a paid feature that reaches nobody, and charging for that is
 * worse than not building it.
 *
 * It is stored inverted because a PocketBase `bool` is false when absent, and
 * the first version of this was `open_to_gyms` backfilled to true. That is only
 * a default for accounts that already existed: every signup afterwards arrived
 * as false and was silently opted out, so the feature would have reached a
 * shrinking set of early users and nobody else. Found by the audit asking a
 * freshly created account. Phrased as the refusal, the default is structural
 * rather than something a backfill or a hook has to keep being right about.
 *
 * **No geography.** We hold no location for anybody, so "targeting" here means
 * everyone with no gym and nothing finer. The landing page says so rather than
 * implying a segmentation that does not exist.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.fields.add(
      new Field({ name: 'closed_to_gyms', type: 'bool' }),
    )
    app.save(users)
    /* No backfill: false is the answer we want, and it is the answer every row
       already has. See the note above for why that is the whole point. */

    const messages = app.findCollectionByNameOrId('gym_messages')
    /**
     * The read rule, with the open door added as its own arm.
     *
     * `@collection.gyms.operators.id != @request.auth.id` repeats from the
     * house arms and matters for the same reason: an operator's own `users.gym`
     * is empty, so without it every gym operator on the platform reads as
     * somebody with no gym and receives their rivals' recruiting.
     */
    const readRule = [
      "@request.auth.id != '' &&",
      '(',
      'gym = @request.auth.gym',
      '|| gym.operators.id ?= @request.auth.id',
      "|| (gym.kind = 'house' && scope = 'everyone')",
      "|| (gym.kind = 'house' && scope = 'unaffiliated' && @request.auth.gym = ''",
      '&& @collection.gyms.operators.id != @request.auth.id)',
      "|| (scope = 'open-door' && @request.auth.gym = ''",
      '&& @request.auth.closed_to_gyms = false',
      '&& @collection.gyms.operators.id != @request.auth.id)',
      ')',
    ].join(' ')
    messages.listRule = readRule
    messages.viewRule = readRule
    app.save(messages)
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    /* Back to exactly the string 1757600000 left, so a rollback restores the
       rule rather than approximating it. */
    const readRule = [
      "@request.auth.id != '' &&",
      '(',
      'gym = @request.auth.gym',
      '|| gym.operators.id ?= @request.auth.id',
      "|| (gym.kind = 'house' && scope = 'everyone')",
      "|| (gym.kind = 'house' && scope = 'unaffiliated' && @request.auth.gym = ''",
      '&& @collection.gyms.operators.id != @request.auth.id)',
      ')',
    ].join(' ')
    messages.listRule = readRule
    messages.viewRule = readRule
    app.save(messages)

    /* Any open-door rows go with the rule that made them readable. Left behind,
       they would sit in the collection addressed to an audience nothing can
       evaluate any more. */
    for (const row of app.findAllRecords('gym_messages')) {
      if (row.get('scope') === 'open-door') app.delete(row)
    }

    const users = app.findCollectionByNameOrId('users')
    users.fields.removeByName('closed_to_gyms')
    app.save(users)
  },
)
