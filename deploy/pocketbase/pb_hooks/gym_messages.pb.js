/// <reference path="../pb_data/types.d.ts" />
/**
 * Publishing to a gym is an operator's act. The collection rule already pins
 * the author to the signed-in account; these hooks enforce the parts a create
 * rule cannot express — that the author actually operates the target gym, and
 * that only the house may address anybody beyond its own members.
 *
 * The shared predicates come from utils/house_gym.js and utils/open_door.js
 * because each handler runs in its own VM and cannot see a function declared
 * beside it here.
 */

onRecordCreateRequest((e) => {
  const { isHouseGym, isPlatformAdmin, HOUSE_SCOPES } = require(`${__hooks}/utils/house_gym.js`)

  const gymId = e.record.get('gym')
  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    throw new BadRequestError('That gym does not exist.')
  }
  const authId = e.auth ? e.auth.id : ''
  const scope = String(e.record.get('scope') || '')

  /**
   * The schedule, checked for everybody — the house included, which is why it
   * sits above the branch. The rule that actually withholds the message is in
   * the collection's read rule; this is only the part a rule cannot say.
   */
  const { refuseSchedule } = require(`${__hooks}/utils/scheduling.js`)
  /**
   * Read off the request, not off the record.
   *
   * A `date` field coerces anything it cannot parse to empty, so by the time
   * the record has it, "next tuesday-ish" and "publish now" are the same value
   * — and the message a gym meant for Monday goes out on Sunday with nobody
   * told. The audit caught it. What was asked for is in the body.
   */
  const body = e.requestInfo().body || {}
  const lateness = refuseSchedule(
    e.record.get('publish_at'),
    String(gym.get('plan') || ''),
    gym.get('kind') === 'house',
    Date.now(),
    Object.prototype.hasOwnProperty.call(body, 'publish_at'),
  )
  if (lateness) throw new BadRequestError(lateness)

  if (isHouseGym(gym)) {
    if (!isPlatformAdmin(e.app, authId)) {
      throw new ForbiddenError('Only a platform admin can publish from enForma.')
    }
    if (HOUSE_SCOPES.indexOf(scope) === -1) {
      throw new BadRequestError('Choose who this is for: unaffiliated, or everyone.')
    }
    return e.next()
  }

  const operators = gym.get('operators') || []
  if (!authId || !operators.includes(authId)) {
    throw new ForbiddenError("Only this gym's operators can publish to it.")
  }

  const { OPEN_DOOR, refuseOpenDoor } = require(`${__hooks}/utils/open_door.js`)

  /**
   * The open door is the one scope a gym may use beyond its own roster, and it
   * is checked here rather than in the collection rule because both halves of
   * the answer — the plan, and how many the gym has already sent this month —
   * need a query the rule language cannot make.
   */
  if (scope === OPEN_DOOR) {
    const refusal = refuseOpenDoor(e.app, gym, new Date())
    if (refusal) throw new ForbiddenError(refusal)
    return e.next()
  }

  /**
   * Otherwise a gym reaches its own members and nobody else's. Rejected rather
   * than silently narrowed: a gym that tried to address the platform has
   * misunderstood something, and quietly rewriting it would leave them
   * believing it worked.
   */
  if (scope && scope !== 'members') {
    throw new ForbiddenError('A gym can only publish to its own members.')
  }
  e.next()
}, 'gym_messages')

/**
 * Nobody applies to belong to nothing.
 *
 * The house is where an account already is before it chooses, so a request to
 * join it is meaningless — and were one ever approved, `users.gym` would point
 * at the house and every "do they have a gym?" check in the app, all of which
 * read `gym != ''`, would start answering yes for somebody who has none.
 */
onRecordCreateRequest((e) => {
  const { isHouseGym } = require(`${__hooks}/utils/house_gym.js`)

  let gym = null
  try {
    gym = e.app.findRecordById('gyms', e.record.get('gym'))
  } catch {
    /* A missing gym is the create rule's problem, not this hook's. */
  }
  if (isHouseGym(gym)) {
    throw new BadRequestError('enForma is where you already are. Pick a real gym.')
  }
  e.next()
}, 'gym_join_requests')
