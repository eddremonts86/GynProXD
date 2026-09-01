/// <reference path="../pb_data/types.d.ts" />
/**
 * Write it now, publish it later.
 *
 * The obvious worry about a `publish_at` field is that it does not actually
 * hide anything: the row exists from the moment it is written, and anybody with
 * an account can fetch the collection and read tomorrow's offer today. A gym
 * that scheduled Monday's menu on Sunday evening would have published it on
 * Sunday evening and been told otherwise.
 *
 * That worry sent the first design towards a second collection plus a cron to
 * move rows across at the appointed time — a moving part, a second schema and a
 * window during which a message exists in neither place. It was unnecessary:
 * PocketBase evaluates `@now` inside a collection rule, so the row can simply be
 * unreadable until its time. Checked before this was written, against a real
 * server, because the whole design turned on the answer.
 *
 * So: one nullable field, and a time gate on the arms of the read rule that
 * serve members. The operators' arm is deliberately left ungated — a gym must
 * be able to see what it has queued, and cancel it.
 *
 * Empty means now, which keeps every message ever published readable and makes
 * "scheduled" a thing you opt into rather than a field everything has to carry.
 */
migrate(
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.fields.add(new Field({ name: 'publish_at', type: 'date' }))

    /**
     * The read rule, with the clock added to the arms that serve members.
     *
     * Written as one shared clause rather than repeated four times: the last
     * two migrations both rebuilt this string by hand, and the one before them
     * dropped an `&&` in the process. A message is due when it carries no time
     * at all, or when that time has passed.
     */
    const due = "(publish_at = '' || publish_at <= @now)"
    const readRule = [
      "@request.auth.id != '' &&",
      '(',
      /* Operators first, and ungated: a gym sees its own queue, or it cannot
         cancel what it has scheduled. */
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
    app.save(messages)
  },
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    /* Back to exactly the string 1758000000 left. */
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

    /**
     * Anything still queued goes with the field.
     *
     * Left behind, a row whose `publish_at` nothing reads any more becomes a
     * message that publishes itself the instant this is reverted — which is the
     * one thing a rollback must not do. Rows already past their time are kept:
     * they are published messages, and their schedule is now merely history.
     */
    const now = new Date().toISOString().replace('T', ' ').slice(0, 23) + 'Z'
    for (const row of app.findAllRecords('gym_messages')) {
      const at = String(row.get('publish_at') || '')
      if (at && at > now) app.delete(row)
    }

    messages.fields.removeByName('publish_at')
    app.save(messages)
  },
)
