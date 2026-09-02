/// <reference path="../pb_data/types.d.ts" />
/**
 * A gym sets its colour.
 *
 * An endpoint rather than a collection rule because `gyms.updateRule` is null
 * and stays null — the row carries the operators list and the plan, and opening
 * it for one field opens it for those.
 */
routerAdd('POST', '/api/enforma/gym/set-brand', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in first.' })
  const { isOwner } = require(`${__hooks}/utils/operators.js`)

  const body = e.requestInfo().body || {}
  const gymId = body.gym
  if (!gymId) return e.json(400, { message: 'Which gym?' })

  let gym
  try {
    gym = e.app.findRecordById('gyms', gymId)
  } catch {
    return e.json(404, { message: 'That gym does not exist.' })
  }
  /* The same hand that decides who works the desk. A colour is the gym's face,
     and an operator repainting it without the owner knowing is the same class
     of thing as an operator changing the roster. */
  if (!isOwner(gym, e.auth.id)) {
    return e.json(403, { message: 'Only the gym’s owner can set its colour.' })
  }
  if (String(gym.get('plan') || '') !== 'plus') {
    return e.json(403, { message: 'Your name and colour in their app is part of Plus.' })
  }

  /* Empty clears it, which is how a gym goes back to the app's own colours. */
  const raw = String(body.color || '').trim()
  if (!raw) {
    gym.set('brand_color', '')
    e.app.save(gym)
    return e.json(200, { ok: true, color: '' })
  }

  /**
   * Normalised here as well as in the client, because this endpoint is the
   * thing that actually writes the row — and a colour stored in a shape the
   * app cannot parse would render as nothing at all, which looks exactly like
   * the feature being broken.
   */
  const hex = raw.replace(/^#/, '').toLowerCase()
  const short = /^[0-9a-f]{3}$/.test(hex)
  const long = /^[0-9a-f]{6}$/.test(hex)
  if (!short && !long) {
    return e.json(400, { message: 'A colour looks like #1e3a5f.' })
  }
  const full = short ? hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2] : hex
  gym.set('brand_color', '#' + full)
  e.app.save(gym)
  return e.json(200, { ok: true, color: '#' + full })
})
