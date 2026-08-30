/// <reference path="../pb_data/types.d.ts" />
/**
 * Only a member of the gym can answer that gym's message.
 *
 * The create rule already pins the row to the signed-in account, so nobody
 * answers on someone else's behalf. What it cannot express is the other half:
 * without this check any signed-in stranger could file RSVPs against a gym
 * they have never set foot in, and the reach panel — the number the gym is
 * paying for — would be worth nothing.
 *
 * An operator answering their own gym's message passes: they are testing what
 * they published, and the tallies are theirs to read anyway.
 *
 * Written out twice on purpose. A handler runs in its own JS runtime and
 * cannot see this file's scope, so a shared helper would be undefined at
 * request time and every write would fail as an unexplained 400.
 */
onRecordCreateRequest((e) => {
  const authId = e.auth ? e.auth.id : ''
  if (!authId) throw new ForbiddenError('Sign in first.')

  let message
  try {
    message = e.app.findRecordById('gym_messages', e.record.get('message'))
  } catch {
    throw new BadRequestError('That message does not exist.')
  }
  const gymId = message.get('gym')

  let user
  try {
    user = e.app.findRecordById('users', authId)
  } catch {
    throw new ForbiddenError('Sign in first.')
  }
  if (user.get('gym') !== gymId) {
    let operates = false
    try {
      const gym = e.app.findRecordById('gyms', gymId)
      operates = (gym.get('operators') || []).includes(authId)
    } catch {
      operates = false
    }
    if (!operates) throw new ForbiddenError('Join this gym before answering its messages.')
  }
  e.next()
}, 'gym_responses')

onRecordUpdateRequest((e) => {
  const authId = e.auth ? e.auth.id : ''
  if (!authId) throw new ForbiddenError('Sign in first.')

  let message
  try {
    message = e.app.findRecordById('gym_messages', e.record.get('message'))
  } catch {
    throw new BadRequestError('That message does not exist.')
  }
  const gymId = message.get('gym')

  let user
  try {
    user = e.app.findRecordById('users', authId)
  } catch {
    throw new ForbiddenError('Sign in first.')
  }
  if (user.get('gym') !== gymId) {
    let operates = false
    try {
      const gym = e.app.findRecordById('gyms', gymId)
      operates = (gym.get('operators') || []).includes(authId)
    } catch {
      operates = false
    }
    if (!operates) throw new ForbiddenError('Join this gym before answering its messages.')
  }
  e.next()
}, 'gym_responses')
