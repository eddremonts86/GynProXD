/// <reference path="../pb_data/types.d.ts" />
/**
 * Member Pro: the guard on the field, and the one route that reports it.
 *
 * `users` update is `id = @request.auth.id`, and PocketBase rules are per
 * record rather than per field, so an account that may edit its own row may
 * edit every column on it. `gym` had the same problem and
 * `membership.pb.js` solved it the same way: refuse the change in a request
 * hook, and let privileged saves through, because a request hook does not fire
 * for one.
 *
 * That asymmetry is the whole mechanism. `scripts/admin/grant-pro.mjs`
 * authenticates as the superuser and writes the field; a member holding their
 * own token cannot, in either direction. Whatever eventually takes a card will
 * write it the same way, from a route that has verified a signature rather than
 * a session.
 *
 * PocketBase runs each handler in an isolated VM, so `require` happens inside
 * the handler that needs it and nothing at this file's top level is visible
 * from within one.
 */

/**
 * Nobody edits their own entitlement, including to give it up.
 *
 * Clearing it is refused as well as setting it, which is stricter than the
 * `gym` guard next door: leaving a gym is a member's business and cancelling a
 * subscription is the payment provider's. A member who could blank the field
 * would have found the one way to stop paying that leaves no record anywhere of
 * having stopped.
 *
 * Compared as text through the same coercion the check uses, because the two
 * values arrive here as `types.DateTime` and comparing those with `!==`
 * compares object identity, which is never equal and would have refused every
 * update to every user row on the server.
 */
onRecordUpdateRequest((e) => {
  /**
   * The superuser is the exception, and has to be.
   *
   * A request hook fires for a superuser's PATCH as readily as for a member's,
   * which was found by writing the grant script and watching it get a 403 from
   * its own guard. Refusing the platform operator here would be theatre: they
   * hold the dashboard and the database file, so the rule would protect nothing
   * and break the only legitimate way to write this field.
   *
   * `hasSuperuserAuth()` and not "is an admin". `platform_admins` marks an
   * account that carries the app's admin role onto every device, and that is a
   * member of this product with a role, not the operator of the server. The
   * audit checks that one of those cannot grant Pro, because the difference is
   * the kind that erodes quietly.
   */
  if (e.hasSuperuserAuth()) return e.next()

  const { dateText } = require(`${__hooks}/utils/entitlement.js`)
  const before = e.record.original()
  if (dateText(e.record.get('pro_until')) !== dateText(before.get('pro_until'))) {
    throw new ForbiddenError('A subscription is not something an account sets on itself.')
  }
  if (String(e.record.get('pro_source') || '') !== String(before.get('pro_source') || '')) {
    throw new ForbiddenError('A subscription is not something an account sets on itself.')
  }
  /**
   * And the customer id, which is the one of these three that is worth stealing.
   *
   * `invoice.paid` carries a customer and no account reference, so this field is
   * the only route from a renewal back to a person. An account that could set it
   * to somebody else's customer would be pointing that person's renewals at
   * itself: every month they paid would extend the wrong subscription, and the
   * person paying would watch theirs lapse.
   *
   * Found by `pro-boundary.mjs`, after the migration that added the field had
   * already claimed in a comment that this guard covered it. It did not.
   */
  if (
    String(e.record.get('stripe_customer') || '') !== String(before.get('stripe_customer') || '')
  ) {
    throw new ForbiddenError('A billing customer is not something an account sets on itself.')
  }
  e.next()
}, 'users')

/**
 * What this account is entitled to, asked by the account itself.
 *
 * Deliberately not part of `/api/enforma/capabilities`: that route is
 * unauthenticated and answers what the *server* can do, which is the same
 * answer for everybody and is cached as such. This one is about one account and
 * must never be confused with it.
 *
 * It returns the date as well as the verdict because the client needs both. The
 * verdict draws the screen; the date is what lets a device that goes offline
 * decide for itself for a while, instead of asking a server it cannot reach.
 *
 * Nothing about anybody else, and nothing about payment: no customer id, no
 * amount, no card. The account asking already knows what it pays.
 */
routerAdd('GET', '/api/enforma/me', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { dateText, isProAt } = require(`${__hooks}/utils/entitlement.js`)
  const until = dateText(e.auth.get('pro_until'))
  return e.json(200, {
    proUntil: until === '' ? null : until,
    pro: isProAt(until, Date.now()),
  })
})
