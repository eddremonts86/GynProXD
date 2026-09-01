/// <reference path="../pb_data/types.d.ts" />
/**
 * The gym for people who have no gym.
 *
 * Until now a member nobody had claimed received nothing at all. Not less —
 * nothing: the read rule matched `gym` against `@request.auth.gym`, and an
 * account with no gym never matched a row, so the inbox, the banners, the push
 * notifications and the events panel were all built, shipped and dead for
 * them. They were the majority of new accounts.
 *
 * So the platform gets to speak. It is not a gym, and pretending otherwise is
 * the shortcut that eventually sells a competitor's offer to somebody who
 * already pays for a membership. Two fields keep that from happening.
 *
 * `gyms.kind` marks exactly one row as the house. Code identifies it by this
 * field and never by its name, so the name is free to change and a
 * device-local gym that happens to share it is harmless.
 *
 * `gym_messages.scope` says who a message is for. A real gym never sets it and
 * never sees it; absent reads as `members`, so every row already published
 * reaches exactly who it reached yesterday. Only the house may go wider, and
 * the read rule below says so itself rather than trusting the hook to.
 *
 * Note what this migration does NOT do: it does not point anybody's
 * `users.gym` at the house. "Has a gym" stays `gym != ''` everywhere in the
 * app, no row is rewritten, and nobody acquires a membership they did not ask
 * for. Belonging to nothing is a real state and it is modelled as one.
 */
migrate(
  (app) => {
    const gyms = app.findCollectionByNameOrId('gyms')
    gyms.fields.add(new Field({ name: 'kind', type: 'text', max: 8 }))
    app.save(gyms)

    /* Every gym that exists today is a gym. Written out rather than left to a
       default, so a row's kind is never merely implied. */
    for (const gym of app.findAllRecords('gyms')) {
      gym.set('kind', 'gym')
      app.save(gym)
    }

    const house = new Record(gyms)
    house.set('name', 'enForma')
    house.set('kind', 'house')
    /* No operators. Who may publish here is answered by `platform_admins`, so
       granting somebody admin grants it — there is no second list to forget to
       update, and no way to be an operator of the house without being an
       admin of the platform. */
    house.set('operators', [])
    app.save(house)

    const messages = app.findCollectionByNameOrId('gym_messages')
    messages.fields.add(new Field({ name: 'scope', type: 'text', max: 12 }))

    /**
     * Who can read what, stated in the rule rather than delegated.
     *
     * The house arms are gated on `gym.kind = 'house'` on purpose. Without
     * that, any gym could set `scope = 'everyone'` and address the entire
     * platform; the create hook forbids it, but a rule that only works because
     * a hook ran is a rule that stops working the day somebody edits the hook.
     * With it, a rogue row reaches nobody.
     *
     * The last line is the one that had to be measured rather than reasoned
     * about. An operator's own `users.gym` is empty — they run a gym, they are
     * not a member of it — so without it they landed in the "nobody has
     * claimed these people" audience, which the app's own client-side filter
     * already excluded them from. A read rule looser than the filter above it
     * is the same bug shape as a privacy notice looser than the request it
     * describes: nothing appears broken and the two simply disagree.
     *
     * `@collection.gyms.operators.id != @request.auth.id` with no `?` means
     * every operator of every gym differs from the reader — that is, the reader
     * runs nothing. It joins the whole gyms table, which is a handful of rows.
     */
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

    /* Published before scope existed, therefore addressed to members. */
    for (const message of app.findAllRecords('gym_messages')) {
      if (!message.get('scope')) {
        message.set('scope', 'members')
        app.save(message)
      }
    }
  },
  /**
   * The way out, rehearsed rather than assumed.
   *
   * Verified against a database already holding two gyms, five messages and
   * their members: `kind` and `scope` come off, the house row goes, the read
   * rule is restored to the exact string it had, and both gyms keep all five
   * messages — only the house's own cascade away with it.
   *
   * One operational catch, learned the confusing way. `pocketbase serve`
   * applies pending migrations on start, so reverting while this file is still
   * on disk reverts it and then the next restart puts it straight back. A real
   * rollback is: deploy the previous commit first, then `migrate down 1`.
   */
  (app) => {
    const messages = app.findCollectionByNameOrId('gym_messages')
    const readRule =
      "@request.auth.id != '' && (gym = @request.auth.gym || gym.operators.id ?= @request.auth.id)"
    messages.listRule = readRule
    messages.viewRule = readRule
    messages.fields.removeByName('scope')
    app.save(messages)

    const gyms = app.findCollectionByNameOrId('gyms')
    /* The house goes with its messages; `gym` cascades on delete. */
    for (const gym of app.findAllRecords('gyms')) {
      if (gym.get('kind') === 'house') app.delete(gym)
    }
    gyms.fields.removeByName('kind')
    app.save(gyms)
  },
)
