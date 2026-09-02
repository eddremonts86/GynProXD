/**
 * How many gyms an account may own, and how many it does.
 *
 * Lives here rather than beside the handler because a hook runs in its own JS
 * runtime and cannot see anything declared in its own file's scope: a helper
 * called from inside one is undefined at request time, and surfaces as a bare
 * 400 with no message rather than a stack trace. `require` is the way across.
 */
const DEFAULT_CAP = 1

/** Absent, zero or nonsense all mean one. A cap of zero would lock an account
    out of the gym it already owns, which is never what an unset field means. */
function capOf(app, userId) {
  try {
    const cap = app.findRecordById('users', userId).get('gym_cap')
    return cap && cap > 0 ? cap : DEFAULT_CAP
  } catch {
    return DEFAULT_CAP
  }
}

/** Owned, not operated: an account can sit in another gym's roster without
    that gym counting against its own cap. */
function ownedCount(app, userId, exceptGymId) {
  const rows = app.findRecordsByFilter('gyms', 'owner = {:owner}', '', 0, 0, { owner: userId })
  let n = 0
  for (let i = 0; i < rows.length; i++) if (rows[i].id !== exceptGymId) n += 1
  return n
}

function refuseOverCap(app, ownerId, gymId) {
  if (!ownerId) return null
  const cap = capOf(app, ownerId)
  const owned = ownedCount(app, ownerId, gymId)
  if (owned + 1 <= cap) return null
  return (
    'That account may own ' + cap + ' gym' + (cap === 1 ? '' : 's') +
    ' and already owns ' + owned + '. Raise gym_cap on the account first.'
  )
}

module.exports = { DEFAULT_CAP, capOf, ownedCount, refuseOverCap }
