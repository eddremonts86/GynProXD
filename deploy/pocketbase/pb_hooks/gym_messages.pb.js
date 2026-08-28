/// <reference path="../pb_data/types.d.ts" />
/**
 * Publishing to a gym is an operator's act. The collection rule already pins
 * the author to the signed-in account; this hook enforces the part a create
 * rule cannot express — that the author actually operates the target gym.
 */
onRecordCreateRequest((e) => {
  const gymId = e.record.get('gym')
  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    throw new BadRequestError('That gym does not exist.')
  }
  const operators = gym.get('operators') || []
  const authId = e.auth ? e.auth.id : ''
  if (!authId || !operators.includes(authId)) {
    throw new ForbiddenError("Only this gym's operators can publish to it.")
  }
  e.next()
}, 'gym_messages')
