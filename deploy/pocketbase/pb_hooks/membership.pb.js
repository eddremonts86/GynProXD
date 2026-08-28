/// <reference path="../pb_data/types.d.ts" />
/**
 * Membership enforcement. A member's `users.gym` is the confirmed-membership
 * pointer the bus reads; it may only be set by one of the two vetted paths
 * below, never by a direct API write. These *Request hooks guard the API
 * layer; the privileged $app.save() calls in the routes bypass them on
 * purpose, which is exactly how the vetted paths get to set the field.
 */

// Block direct writes to users.gym. Clearing it (leaving a gym) stays free;
// setting or changing it to a real gym must go through code or approval.
onRecordUpdateRequest((e) => {
  const oldGym = e.record.original().get('gym')
  const newGym = e.record.get('gym')
  if (newGym && newGym !== oldGym) {
    throw new ForbiddenError('Join a gym with its code or by approval, not directly.')
  }
  e.next()
}, 'users')

// Join instantly with the gym's code.
routerAdd('POST', '/api/enforma/join-with-code', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const body = e.requestInfo().body || {}
  const gymId = body.gym
  const code = String(body.code || '').trim()
  if (!gymId || !code) return e.json(400, { message: 'Gym and code are required.' })

  let secret
  try {
    secret = e.app.findFirstRecordByFilter('gym_secrets', 'gym = {:g}', { g: gymId })
  } catch {
    return e.json(403, { message: 'That code does not match.' })
  }
  if (secret.get('code') !== code) {
    return e.json(403, { message: 'That code does not match.' })
  }
  const user = e.app.findRecordById('users', e.auth.id)
  user.set('gym', gymId)
  e.app.save(user)
  // A pending request for this gym, if any, is now moot.
  try {
    const req = e.app.findFirstRecordByFilter('gym_join_requests', 'owner = {:o} && gym = {:g}', {
      o: e.auth.id,
      g: gymId,
    })
    e.app.delete(req)
  } catch {
    /* no request to clean up */
  }
  return e.json(200, { ok: true, gym: gymId })
})

// An operator sets or rotates their gym's join code.
routerAdd('POST', '/api/enforma/gym/set-code', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const body = e.requestInfo().body || {}
  const gymId = body.gym
  const code = String(body.code || '').trim()
  if (!gymId || code.length < 4) {
    return e.json(400, { message: 'A join code needs at least 4 characters.' })
  }
  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'No such gym.' })
  }
  if (!(gym.get('operators') || []).includes(e.auth.id)) {
    return e.json(403, { message: 'Only this gym’s operators can set its code.' })
  }
  let secret
  try {
    secret = e.app.findFirstRecordByFilter('gym_secrets', 'gym = {:g}', { g: gymId })
  } catch {
    secret = new Record(e.app.findCollectionByNameOrId('gym_secrets'))
    secret.set('gym', gymId)
  }
  secret.set('code', code)
  e.app.save(secret)
  return e.json(200, { ok: true })
})

// An operator reads their own gym's current code (to share it).
routerAdd('GET', '/api/enforma/gym/code', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const gymId = e.request.url.query().get('gym')
  if (!gymId) return e.json(400, { message: 'gym is required.' })
  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'No such gym.' })
  }
  if (!(gym.get('operators') || []).includes(e.auth.id)) {
    return e.json(403, { message: 'Only this gym’s operators can read its code.' })
  }
  try {
    const secret = e.app.findFirstRecordByFilter('gym_secrets', 'gym = {:g}', { g: gymId })
    return e.json(200, { code: secret.get('code') })
  } catch {
    return e.json(200, { code: null })
  }
})

// When an operator approves a join request, the member actually joins.
onRecordAfterUpdateSuccess((e) => {
  if (e.record.get('status') !== 'approved') {
    e.next()
    return
  }
  try {
    const user = e.app.findRecordById('users', e.record.get('owner'))
    user.set('gym', e.record.get('gym'))
    e.app.save(user)
  } catch {
    /* the requester's account is gone; nothing to do */
  }
  e.next()
}, 'gym_join_requests')
