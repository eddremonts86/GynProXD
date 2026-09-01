/**
 * Who the house is, and who may speak as it.
 *
 * It lives here rather than at the top of the hook file because each hook
 * handler runs in its own isolated VM: a function declared beside the handler
 * is invisible inside it, and calling it fails as a bare 400 with no message
 * and nothing in the log. That is not a style preference, it is the only way
 * two handlers can share a rule.
 *
 * Being here also means the rule can be tested. What it decides — whether an
 * account may address every member of every gym on the platform — is not
 * something to leave as the one rule nothing checks.
 */

/**
 * The one gym that is not a gym.
 *
 * By field, never by name. The name is what a member reads above a message and
 * is free to change; it is also free to collide with a gym somebody typed into
 * their own device catalogue, and that collision has to stay harmless.
 */
function isHouseGym(gym) {
  return !!gym && gym.get('kind') === 'house'
}

/**
 * Permission to broadcast is the same fact as being a platform admin, so it is
 * read from the same row. The house deliberately keeps an empty operators
 * list: a second place to grant this is a second place to forget to revoke it.
 */
function isPlatformAdmin(app, userId) {
  if (!userId) return false
  try {
    app.findFirstRecordByFilter('platform_admins', 'owner = {:o}', { o: userId })
    return true
  } catch {
    return false
  }
}

/**
 * The scopes the house may publish under.
 *
 * `members` is absent on purpose. The house has no members, so a message
 * scoped that way would reach nobody while looking like a successful publish —
 * a silent delivery of nothing. Refusing it makes the audience always a
 * decision somebody made rather than whatever was left in the field.
 */
const HOUSE_SCOPES = ['unaffiliated', 'everyone']

module.exports = { isHouseGym, isPlatformAdmin, HOUSE_SCOPES }
