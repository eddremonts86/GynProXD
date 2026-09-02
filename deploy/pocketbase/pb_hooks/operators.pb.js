/// <reference path="../pb_data/types.d.ts" />
/**
 * The gym's desk: who may publish, and who decides that.
 *
 * Three endpoints and one hook. The shared rules live in utils/operators.js
 * because each handler runs in its own VM and cannot see a function declared
 * beside it here.
 */

/**
 * Who works this gym's desk, as its own operators may read it.
 *
 * An endpoint rather than a collection read, because `users` is
 * `id = @request.auth.id` — an account can only read itself. The panel needs a
 * colleague's address to list the desk and to say who wrote a message, and
 * loosening that rule would hand over whole user rows to get one field. This
 * hands over the one field, to exactly the people already able to publish as
 * the gym.
 *
 * Found by the audit: the first build fetched each operator's row directly, so
 * a colleague vanished from the roster the moment they accepted — the failed
 * read was swallowed and drew an empty seat.
 */
routerAdd('GET', '/api/enforma/gym/desk', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const gymId = e.request.url.query().get('gym')
  if (!gymId) return e.json(400, { message: 'Which gym?' })

  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'That gym does not exist.' })
  }
  const operators = gym.get('operators') || []
  if (!operators.includes(e.auth.id)) {
    return e.json(403, { message: 'Only this gym’s operators can read its desk.' })
  }

  const owner = String(gym.get('owner') || '')
  const people = []
  for (const id of operators) {
    try {
      const user = e.app.findRecordById('users', id)
      people.push({ id: id, email: user.get('email'), owner: id === owner })
    } catch {
      /* An account deleted out from under the roster is simply not there. */
    }
  }
  return e.json(200, { people: people })
})

/** Invite somebody to the desk, by address, whether or not they have an account. */
routerAdd('POST', '/api/enforma/gym/invite', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { normaliseEmail, refuseInvite } = require(`${__hooks}/utils/operators.js`)

  const body = e.requestInfo().body || {}
  const gymId = body.gym
  const email = normaliseEmail(body.email)
  if (!gymId) return e.json(400, { message: 'Which gym?' })

  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'That gym does not exist.' })
  }

  const operators = gym.get('operators') || []
  let pending = []
  try {
    pending = e.app.findRecordsByFilter('gym_invites', 'gym = {:g}', '-created', 100, 0, { g: gymId })
  } catch {
    /* none */
  }
  const refusal = refuseInvite(gym, e.auth.id, email, operators.length + pending.length)
  if (refusal) return e.json(403, { message: refusal })

  /* Already at the desk. Said as a fact rather than an error: the owner asked
     for a state that already holds. */
  for (const id of operators) {
    try {
      if (normaliseEmail(e.app.findRecordById('users', id).get('email')) === email) {
        return e.json(200, { ok: true, already: true })
      }
    } catch {
      /* a deleted account cannot match */
    }
  }

  /**
   * Written for the address, not looked up.
   *
   * Adding whoever holds that address directly would answer, for anybody with a
   * gym, whether any given email has an enForma account — an enumeration oracle
   * handed to every customer. The row is written either way and claimed at
   * sign-in, so the answer here never depends on who exists.
   */
  const collection = e.app.findCollectionByNameOrId('gym_invites')
  const invite = new Record(collection)
  invite.set('gym', gymId)
  invite.set('email', email)
  invite.set('invited_by', e.auth.id)
  try {
    e.app.save(invite)
  } catch {
    /* The unique index: inviting twice is one invitation, not an error. */
    return e.json(200, { ok: true, already: true })
  }

  /* Claimed immediately when that account is already signed up, so the owner
     does not watch a pending row for somebody who is right there. */
  try {
    const user = e.app.findFirstRecordByFilter('users', 'email = {:e}', { e: email })
    gym.set('operators', operators.concat([user.id]))
    e.app.save(gym)
    e.app.delete(invite)
    return e.json(200, { ok: true, joined: true })
  } catch {
    /* No account yet. The row waits; see the auth hook below. */
  }
  return e.json(200, { ok: true, invited: true })
})

/** Take somebody off the desk. The owner cannot be removed, including by themselves. */
routerAdd('POST', '/api/enforma/gym/remove-operator', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { isOwner } = require(`${__hooks}/utils/operators.js`)

  const body = e.requestInfo().body || {}
  const gymId = body.gym
  const userId = String(body.user || '')
  if (!gymId || !userId) return e.json(400, { message: 'Which gym, and who?' })

  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'That gym does not exist.' })
  }
  if (!isOwner(gym, e.auth.id)) {
    return e.json(403, { message: 'Only the gym’s owner can change who works the desk.' })
  }
  /**
   * The owner stays.
   *
   * Not a courtesy: `owner` is what every check here reads, so a gym whose
   * owner had been removed from its own operators list would be a gym nobody
   * could add anybody to, recoverable only by a superuser.
   */
  if (isOwner(gym, userId)) {
    return e.json(400, { message: 'The owner holds the account and stays on the desk.' })
  }

  const operators = (gym.get('operators') || []).filter((id) => id !== userId)
  gym.set('operators', operators)
  e.app.save(gym)
  return e.json(200, { ok: true })
})

/** Withdraw an invitation nobody has claimed yet. */
routerAdd('POST', '/api/enforma/gym/cancel-invite', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { isOwner } = require(`${__hooks}/utils/operators.js`)

  const body = e.requestInfo().body || {}
  let invite
  try {
    invite = e.app.findRecordById('gym_invites', String(body.invite || ''))
  } catch {
    return e.json(404, { message: 'That invitation is already gone.' })
  }
  const gym = e.app.findRecordById('gyms', invite.get('gym'))
  if (!isOwner(gym, e.auth.id)) {
    return e.json(403, { message: 'Only the gym’s owner can change who works the desk.' })
  }
  e.app.delete(invite)
  return e.json(200, { ok: true })
})

/**
 * An invitation is claimed when its address signs in.
 *
 * On auth rather than on sign-up, so an invitation sent to somebody who already
 * had an account works too — and so one sent to an address that signs up later
 * is picked up the first time they arrive, with nothing to click.
 */
onRecordAuthRequest((e) => {
  e.next()
  const { normaliseEmail } = require(`${__hooks}/utils/operators.js`)
  const email = normaliseEmail(e.record.get('email'))
  if (!email) return

  let invites = []
  try {
    invites = e.app.findRecordsByFilter('gym_invites', 'email = {:e}', '-created', 20, 0, { e: email })
  } catch {
    return
  }
  for (const invite of invites) {
    try {
      const gym = e.app.findRecordById('gyms', invite.get('gym'))
      const operators = gym.get('operators') || []
      if (!operators.includes(e.record.id)) {
        gym.set('operators', operators.concat([e.record.id]))
        e.app.save(gym)
      }
      e.app.delete(invite)
    } catch {
      /* A gym deleted between the invitation and the sign-in takes its
         invitations with it; nothing to do and nothing to report. */
    }
  }
}, 'users')
