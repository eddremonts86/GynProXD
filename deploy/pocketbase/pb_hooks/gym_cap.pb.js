/// <reference path="../pb_data/types.d.ts" />
/**
 * The cap that makes Enterprise a product rather than a promise.
 *
 * `users.gym_cap` says how many gyms one account may own. Unchecked it is a
 * note in a spreadsheet: the page sells "up to five", and nothing stops a sixth
 * being provisioned by the same hand as the fifth, at the same money.
 *
 * The check sits on the gym rather than on a public endpoint because only a
 * superuser makes a gym today, and the provisioning path is exactly where a cap
 * gets forgotten. Raising the cap is a write to `users`, which this does not
 * touch, so the order is the obvious one: agree the number, set it, provision.
 *
 * Superusers are not exempt. If they were, the only path that can create a gym
 * would be the one path the cap does not apply to.
 *
 * The check is written out twice rather than shared through a local function,
 * for the reason the menus hook documents: a handler runs in its own runtime
 * and cannot see this file's scope. `require` crosses that line; a plain call
 * does not.
 */
onRecordCreateRequest((e) => {
  const { refuseOverCap } = require(`${__hooks}/utils/gym_cap.js`)
  const problem = refuseOverCap(e.app, e.record.get('owner'), e.record.id)
  if (problem) throw new BadRequestError(problem)
  e.next()
}, 'gyms')

onRecordUpdateRequest((e) => {
  const { refuseOverCap } = require(`${__hooks}/utils/gym_cap.js`)
  const problem = refuseOverCap(e.app, e.record.get('owner'), e.record.id)
  if (problem) throw new BadRequestError(problem)
  e.next()
}, 'gyms')
