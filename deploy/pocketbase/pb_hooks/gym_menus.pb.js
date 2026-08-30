/// <reference path="../pb_data/types.d.ts" />
/**
 * The kitchen card is the gym's to write. The collection rules can say "signed
 * in" and "this row belongs to a gym you can read", but not "you operate that
 * gym" — checking that means following the draft's relation, which a rule
 * cannot do and a hook can.
 *
 * The check is written out twice rather than shared: a handler here runs in
 * its own JS runtime and cannot see anything declared in this file's scope, so
 * a helper called from inside one is simply undefined at request time — which
 * surfaces as a bare 400 with no message, not as a stack trace.
 */
onRecordCreateRequest((e) => {
  let gym
  try {
    gym = e.app.findRecordById('gyms', e.record.get('gym'))
  } catch {
    throw new BadRequestError('That gym does not exist.')
  }
  const operators = gym.get('operators') || []
  const authId = e.auth ? e.auth.id : ''
  if (!authId || !operators.includes(authId)) {
    throw new ForbiddenError("Only this gym's operators can write its menu.")
  }
  e.next()
}, 'gym_menus')

onRecordUpdateRequest((e) => {
  let gym
  try {
    gym = e.app.findRecordById('gyms', e.record.get('gym'))
  } catch {
    throw new BadRequestError('That gym does not exist.')
  }
  const operators = gym.get('operators') || []
  const authId = e.auth ? e.auth.id : ''
  if (!authId || !operators.includes(authId)) {
    throw new ForbiddenError("Only this gym's operators can write its menu.")
  }
  e.next()
}, 'gym_menus')
