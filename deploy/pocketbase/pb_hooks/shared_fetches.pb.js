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
  const coachKey = !!($os.getenv('COACH_API_KEY') || $os.getenv('MINIMAX_API_KEY'))
  const coachHost = coachKey
    ? require(`${__hooks}/utils/coach_host.js`).coachHostFor(
        $os.getenv('COACH_BASE_URL') ||
          $os.getenv('MINIMAX_BASE_URL') ||
          'https://api.minimaxi.chat/v1',
      )
    : null

  return e.json(200, {
    coach: coachKey,
    coachHost,
    recipes:
      hasCatalogue ||
      !!($os.getenv('FATSECRET_CLIENT_ID') && $os.getenv('FATSECRET_CLIENT_SECRET')),
    push: $os.getenv('VAPID_PUBLIC_KEY') || null,
    /**
     * Whether this server can actually take a card.
     *
     * The key is the whole test, because the price ids are not configured here:
     * `utils/billing.js` holds an allowlist of Stripe *lookup keys* and the
     * checkout resolves the id from Stripe at the time. A client that could
     * name a price id could name any price in the account, which on a shared
     * account is another project's.
     *
     * The client shows the button only when this is true AND a Pro feature is
     * built, so nobody is asked for money before there is something behind it.
     */
    billing: !!$os.getenv('STRIPE_SECRET_KEY'),
    /* A Ticketmaster key: what is on near a member, behind /api/enforma/events/near. */
    events: !!$os.getenv('TICKETMASTER_API_KEY'),
    /**
     * Whether a member can connect a real calendar here.
     *
     * All four, because three of them is a connection that fails halfway: the
     * client pair to ask Google with, the redirect Google was told about, and
     * the key that seals the refresh token at rest. Without the last one the
     * route refuses rather than storing a live token in the clear, and a button
     * that cannot work should not be drawn.
     */
    calendars: {
      google: !!(
        $os.getenv('GOOGLE_CLIENT_ID') &&
        $os.getenv('GOOGLE_CLIENT_SECRET') &&
        $os.getenv('GOOGLE_REDIRECT_URI') &&
        String($os.getenv('CALENDAR_SECRET') || '').length === 32
      ),
      /* Apple needs no client registration of any kind: the credential is an
         app-specific password the member makes themselves, so the sealing key
         is the only thing that has to exist here. */
      apple: String($os.getenv('CALENDAR_SECRET') || '').length === 32,
      /* A published address needs no registration either, and no account: the
         sealing key is all it wants, because the address is what gets sealed. */
      url: String($os.getenv('CALENDAR_SECRET') || '').length === 32,
      microsoft: !!(
        $os.getenv('MICROSOFT_CLIENT_ID') &&
        $os.getenv('MICROSOFT_CLIENT_SECRET') &&
        $os.getenv('MICROSOFT_REDIRECT_URI') &&
        String($os.getenv('CALENDAR_SECRET') || '').length === 32
      ),
    },
    /* Stripe's own hosted portal, where cancelling happens. A configured URL
       rather than a route of ours: cancelling is legally theirs to get right. */
    portal: $os.getenv('STRIPE_PORTAL_URL') || null,
  })
})

/**
 * The coach, whoever is answering today.
 *
 * The path still says `minimax` because the browser bundle calls it that and a
 * renamed route is a deploy where old tabs get a 404 for no gain. The vendor
 * behind it is configuration: `COACH_*` if set, the old `MINIMAX_*` otherwise,
 * so a server that has not been reconfigured keeps working unchanged.
 *
 * Two things this stopped being a plain passthrough for.
 *
 * The model name used to be baked into the browser bundle at build time while
 * the key was read here at runtime — so rotating a key was a variable and trying
 * a different model was a deploy. `COACH_MODEL` overrides what the client asked
 * for, and the asymmetry is gone.
 *
 * And nothing counted. "Is the flat rate we pay cheap?" had no answer because
 * no one knew how many designs happen or what they spend. Every call now leaves
 * a row in `coach_usage` — tokens, latency, and whether it worked — which is
 * what turns that question into arithmetic.
 */
routerAdd('POST', '/api/minimax/chat/completions', (e) => {
  if (!e.auth) return e.json(401, { message: 'Sign in to use the coach.' })

  /**
   * The cap.
   *
   * Every call is billed to us and nothing stopped one account making them in
   * a loop. The meter below already writes a row per call, so the limit is a
   * count over it rather than a new table.
   *
   * Twenty a day per account: the intake spends one call per programme and the
   * kitchen one per suggestion, so twenty is a working day of both and still
   * two orders of magnitude short of a bill that hurts.
   *
   * Checked before the key on purpose. Over the limit is true whether or not
   * this server has a coach configured, and asking it first is what makes the
   * boundary testable on a sandbox that has no vendor key. An unreadable meter
   * must never become a closed door, hence the catch.
   *
   * Nobody sees an error for it: both callers fall back to the deterministic
   * generator on any non-2xx, so an account over the limit still gets a
   * programme — designed by us instead of rented.
   */
  const CALLS_PER_DAY = 20
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().replace('T', ' ')
    const used = $app.countRecords(
      'coach_usage',
      $dbx.exp('owner = {:owner} AND created >= {:since}', { owner: e.auth.id, since: since }),
    )
    if (used >= CALLS_PER_DAY) {
      return e.json(429, {
        message: 'The coach has already answered ' + CALLS_PER_DAY + ' times for this account today.',
      })
    }
  } catch {
    /* Unmetered, and still answered. */
  }

  const key = $os.getenv('COACH_API_KEY') || $os.getenv('MINIMAX_API_KEY')
  if (!key) return e.json(503, { message: 'No coach on this server.' })
  const base =
    $os.getenv('COACH_BASE_URL') || $os.getenv('MINIMAX_BASE_URL') || 'https://api.minimaxi.chat/v1'
  const model = $os.getenv('COACH_MODEL') || ''

  let body = readerToString(e.request.body)
  /* Substituted rather than appended: the client sends a model name from its own
     build, and two `model` keys in one object is a coin toss over which the
     vendor honours. Parsing can fail on a body this route did not build, and a
     failure here should cost the override, not the request. */
  if (model) {
    try {
      const parsed = JSON.parse(body)
      parsed.model = model
      body = JSON.stringify(parsed)
    } catch {
      /* Left as sent. */
    }
  }

  const startedAt = Date.now()
  let res = null
  let failure = null
  try {
    res = $http.send({
      url: base + '/chat/completions',
      method: 'POST',
      body: body,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      timeout: 180,
    })
  } catch (err) {
    failure = err
  }
  const ms = Date.now() - startedAt

  /**
   * The meter, which must never be the reason a programme fails.
   *
   * Wrapped whole: a broken collection, a missing migration or a field renamed
   * out from under it would otherwise turn "we cannot measure this" into "the
   * coach is down". Measurement is worth having and it is not worth that.
   */
  try {
    const json = res && res.json ? res.json : null
    const usage = (json && json.usage) || {}
    const record = new Record(e.app.findCollectionByNameOrId('coach_usage'))
    record.set('owner', e.auth ? e.auth.id : '')
    /* What the provider says it used, not what was asked for. They differ when a
       vendor substitutes silently, and the substitution is the interesting part. */
    record.set('model', (json && json.model) || model || '')
    record.set('host', String(base).replace(/^[a-z]+:\/\//i, '').split('/')[0])
    /* OpenAI names them prompt/completion; the Anthropic dialect names them
       input/output. Reading both means the meter survives a change of dialect. */
    record.set('input_tokens', usage.prompt_tokens || usage.input_tokens || 0)
    record.set('output_tokens', usage.completion_tokens || usage.output_tokens || 0)
    record.set('ms', ms)
    record.set('status', res ? res.statusCode : 0)
    record.set('ok', !!res && res.statusCode >= 200 && res.statusCode < 300)
    e.app.save(record)
  } catch {
    /* Unmeasured, and still answered. */
  }

  if (failure) return e.json(502, { message: 'The coach could not be reached.' })
  return e.json(res.statusCode, res.json)
})
