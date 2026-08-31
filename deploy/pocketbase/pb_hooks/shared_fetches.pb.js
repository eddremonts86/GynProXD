/// <reference path="../pb_data/types.d.ts" />
/**
 * Phase 7: the fetches every member used to make on their own device, made
 * once here instead. The MiniMax key lives in this process's environment and
 * never reaches a browser. Recipes moved out to recipes.pb.js in phase 8,
 * where the catalogue answers first and a vendor is only the fallback.
 *
 * PocketBase runs each handler in an isolated VM: nothing at this file's top
 * level is visible inside them, so every helper is defined where it runs.
 *
 * `/api/enforma/capabilities` is how the app learns what this server can do —
 * the client shows AI-coach and recipe-search copy only when they are real.
 */

routerAdd('GET', '/api/enforma/capabilities', (e) => {
  let hasCatalogue = false
  try {
    hasCatalogue = $app.findRecordsByFilter('recipes', "provider = 'pd'", '', 1, 0).length > 0
  } catch {
    /* Collection missing on a pre-migration boot: capability stays false. */
  }
  /**
   * Where the coach actually runs, so the app can say so instead of implying.
   *
   * The intake sends whatever somebody typed — including the sentence about a
   * knee — to whichever model designs the programme. Which model that is, is a
   * property of THIS server's environment, and the browser has no way to know
   * it. Reporting it is what lets a screen tell the truth without guessing, and
   * what makes the truth change by itself the day the base URL is repointed at
   * something we host.
   *
   * The classification is in `utils/coach_host.js` because it decides which of
   * two sentences a member reads, and one of them promises their words did not
   * leave. That deserves tests, and nothing can test a closure inside a handler.
   */
  const coachKey = !!$os.getenv('MINIMAX_API_KEY')
  const coachHost = coachKey
    ? require(`${__hooks}/utils/coach_host.js`).coachHostFor(
        $os.getenv('MINIMAX_BASE_URL') || 'https://api.minimaxi.chat/v1',
      )
    : null

  return e.json(200, {
    coach: coachKey,
    coachHost,
    recipes:
      hasCatalogue ||
      !!($os.getenv('FATSECRET_CLIENT_ID') && $os.getenv('FATSECRET_CLIENT_SECRET')),
    push: $os.getenv('VAPID_PUBLIC_KEY') || null,
  })
})

routerAdd('POST', '/api/minimax/chat/completions', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in to use the coach.' })
  const key = $os.getenv('MINIMAX_API_KEY')
  if (!key) return e.json(503, { message: 'No coach on this server.' })
  const base = $os.getenv('MINIMAX_BASE_URL') || 'https://api.minimaxi.chat/v1'
  const res = $http.send({
    url: base + '/chat/completions',
    method: 'POST',
    body: readerToString(e.request.body),
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
    timeout: 180,
  })
  return e.json(res.statusCode, res.json)
})
