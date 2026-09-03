/// <reference path="../pb_data/types.d.ts" />
/**
 * Both sides of the area filter agree on how a place is spelled.
 *
 * The open-door read rule matches `area` exactly, and a rule cannot lower-case
 * anything. So the normalising happens on write, on the member's row and on the
 * gym's message, and a member who typed "Lisboa" hears from a gym that typed
 * "lisboa ".
 *
 * `require` inside each handler rather than a shared function above them: a
 * handler runs in its own runtime and cannot see this file's scope, which
 * surfaces as a bare 400 with nothing in the log.
 */
onRecordCreateRequest((e) => {
  const { normaliseArea } = require(`${__hooks}/utils/area.js`)
  e.record.set('area', normaliseArea(e.record.get('area')))
  e.next()
}, 'gym_messages')

onRecordUpdateRequest((e) => {
  const { normaliseArea } = require(`${__hooks}/utils/area.js`)
  e.record.set('area', normaliseArea(e.record.get('area')))
  e.next()
}, 'gym_messages')

onRecordUpdateRequest((e) => {
  const { normaliseArea } = require(`${__hooks}/utils/area.js`)
  e.record.set('area', normaliseArea(e.record.get('area')))
  e.next()
}, 'users')
