import { describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/stripe_sig.js?raw'

/**
 * The whole boundary between "a payment happened" and "somebody posted some
 * JSON at us", tested against the file PocketBase actually loads.
 *
 * Same arrangement as `coach-host.spec.ts` and `entitlement-hook.spec.ts`: the
 * bytes are pulled in with `?raw` and evaluated, because the file is CommonJS
 * for PocketBase's runtime and a copy in here would keep passing while the
 * shipped one drifted.
 *
 * There is no session behind a webhook — Stripe is not signed in as anybody —
 * so every case below is the authentication itself. The asymmetry: refusing a
 * real event costs a retry, which Stripe does for days. Accepting a forged one
 * grants a subscription nobody paid for.
 */
interface Shipped {
  DEFAULT_TOLERANCE_SEC?: number
  parseSignatureHeader?: (header: unknown) => { timestamp: number | null; signatures: string[] }
  verifyStripeSignature?: (options: Record<string, unknown>) => {
    ok: boolean
    reason: string
    timestamp?: number
  }
  livemodeOf?: (key: unknown) => boolean | null
}
const shipped = { exports: {} as Shipped }
new Function('module', 'exports', source)(shipped, shipped.exports)
const { parseSignatureHeader, verifyStripeSignature, livemodeOf, DEFAULT_TOLERANCE_SEC } =
  shipped.exports as Required<Shipped>

/**
 * A stand-in digest, and deliberately not a real HMAC.
 *
 * The function under test never computes one: it is handed
 * `$security.hs256` and compares whatever comes back against the header. So
 * everything here — header parsing, the tolerance, secret rotation, the length
 * check, delegating to the constant-time compare — is exercised identically by
 * a deterministic fake, and a fake keeps this file free of Node types. That
 * matters more than it sounds: pulling `@types/node` in for `node:crypto`
 * applies to the whole compilation, and it immediately broke an unrelated cast
 * in `profiles.spec.ts` by resolving `setTimeout` to Node's.
 *
 * What a fake cannot prove is that PocketBase's own `hs256` returns the
 * lowercase hex Stripe signs with. That is not this function's business and it
 * is checked where it can be: `pro-boundary.mjs` posts a really-signed body,
 * built with `node:crypto`, at a real PocketBase.
 */
const hmac = (text: string, secret: string) => {
  let a = 0x811c9dc5
  const input = `${secret}\u0000${text}`
  for (let i = 0; i < input.length; i += 1) {
    a ^= input.charCodeAt(i)
    a = Math.imul(a, 0x01000193) >>> 0
  }
  /* Sixty-four lowercase hex characters, the shape a SHA-256 digest has, so the
     length check in the function under test is exercised rather than skipped. */
  let out = ''
  let state = a
  while (out.length < 64) {
    state = Math.imul(state ^ (state >>> 15), 0x2545f491) >>> 0
    out += state.toString(16).padStart(8, '0')
  }
  return out.slice(0, 64)
}

const SECRET = 'whsec_testtesttesttesttesttesttest'
const BODY = '{"id":"evt_1","type":"invoice.paid","livemode":false}'
const NOW = 1_757_937_000

/** A header the way Stripe builds one. */
const sign = (body: string, secret: string, t = NOW) => `t=${t},v1=${hmac(`${t}.${body}`, secret)}`

const verify = (over: Record<string, unknown> = {}) =>
  verifyStripeSignature({
    header: sign(BODY, SECRET),
    body: BODY,
    secrets: [SECRET],
    nowSec: NOW,
    hmac,
    ...over,
  })

describe('parseSignatureHeader', () => {
  it('reads the timestamp and the signature', () => {
    const parsed = parseSignatureHeader('t=1757937000,v1=abc')
    expect(parsed).toEqual({ timestamp: 1757937000, signatures: ['abc'] })
  })

  it('reads several signatures, which is what a rotation looks like', () => {
    // Stripe signs with both secrets while an endpoint secret is being rolled.
    // Accepting a header with more than one is what makes rotating possible
    // without dropping events on the floor.
    expect(parseSignatureHeader('t=1,v1=a,v1=b').signatures).toEqual(['a', 'b'])
  })

  it('ignores the scheme versions it does not know', () => {
    expect(parseSignatureHeader('t=1,v0=old,v1=new').signatures).toEqual(['new'])
  })

  it('has no timestamp for a header that is not one', () => {
    for (const header of ['', 'nonsense', 'v1=abc', 't=later,v1=abc', null, undefined]) {
      expect(parseSignatureHeader(header).timestamp).toBeNull()
    }
  })
})

describe('verifyStripeSignature', () => {
  it('accepts what Stripe would send', () => {
    expect(verify()).toMatchObject({ ok: true, reason: 'ok', timestamp: NOW })
  })

  it('refuses a body that changed by one byte', () => {
    // The reason the raw bytes matter. `requestInfo().body` is parsed, and
    // re-serialising it reorders keys and drops whitespace, so a digest over
    // the round trip never matches what was signed.
    expect(verify({ body: `${BODY} ` }).ok).toBe(false)
    expect(verify({ body: '{"id":"evt_1","livemode":false,"type":"invoice.paid"}' }).ok).toBe(false)
  })

  it('refuses a signature made with a different secret', () => {
    expect(verify({ header: sign(BODY, 'whsec_someone_else') })).toMatchObject({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('refuses a body with no signature at all', () => {
    expect(verify({ header: '' }).ok).toBe(false)
    expect(verify({ header: `t=${NOW}` })).toMatchObject({ ok: false, reason: 'no-signature' })
  })

  it('refuses when this server holds no secret', () => {
    // Not the same as a bad signature, and worth its own reason: it means the
    // deploy is missing a variable, not that somebody is knocking.
    expect(verify({ secrets: [] })).toMatchObject({ ok: false, reason: 'no-secret' })
    expect(verify({ secrets: [''] })).toMatchObject({ ok: false, reason: 'no-secret' })
  })

  it('refuses an empty body', () => {
    expect(verify({ body: '' })).toMatchObject({ ok: false, reason: 'no-body' })
  })
})

describe('the timestamp, which is what stops a replay', () => {
  it('accepts inside the tolerance', () => {
    const t = NOW - DEFAULT_TOLERANCE_SEC + 1
    expect(verify({ header: sign(BODY, SECRET, t) }).ok).toBe(true)
  })

  it('refuses outside it, however good the signature is', () => {
    // Without this a body captured once stays valid forever, and the signature
    // on a year-old replay is perfectly correct.
    const t = NOW - DEFAULT_TOLERANCE_SEC - 1
    expect(verify({ header: sign(BODY, SECRET, t) })).toMatchObject({ ok: false, reason: 'stale' })
  })

  it('refuses one from the future too', () => {
    // A stamp ahead of us is not a fast clock, it is a body somebody built.
    const t = NOW + DEFAULT_TOLERANCE_SEC + 1
    expect(verify({ header: sign(BODY, SECRET, t) })).toMatchObject({ ok: false, reason: 'stale' })
  })

  it('is Stripe own five minutes', () => {
    expect(DEFAULT_TOLERANCE_SEC).toBe(300)
  })
})

describe('rotating the endpoint secret', () => {
  it('accepts either while both are held', () => {
    const older = 'whsec_the_old_one'
    expect(verify({ secrets: [SECRET, older] }).ok).toBe(true)
    expect(verify({ header: sign(BODY, older), secrets: [SECRET, older] }).ok).toBe(true)
  })

  it('refuses one signed with a secret that has been retired', () => {
    const retired = 'whsec_retired'
    expect(verify({ header: sign(BODY, retired), secrets: [SECRET] }).ok).toBe(false)
  })
})

describe('the comparison', () => {
  it('uses the constant-time compare it is given', () => {
    // Handed `$security.equal` in the hook. A test that passed with `===` and
    // never called the injected one would not notice it being dropped.
    let called = 0
    const result = verify({
      equal: (a: string, b: string) => {
        called += 1
        return a === b
      },
    })
    expect(result.ok).toBe(true)
    expect(called).toBeGreaterThan(0)
  })

  it('does not compare digests of different lengths', () => {
    const result = verify({
      header: `t=${NOW},v1=tooshort`,
      equal: () => {
        throw new Error('should not be reached')
      },
    })
    expect(result).toMatchObject({ ok: false, reason: 'mismatch' })
  })

  it('survives an hmac that throws rather than admitting the event', () => {
    expect(
      verify({
        hmac: () => {
          throw new Error('no crypto here')
        },
      }),
    ).toMatchObject({ ok: false, reason: 'hmac-failed' })
  })

  it('refuses an hmac that returns nothing useful', () => {
    expect(verify({ hmac: () => '' })).toMatchObject({ ok: false, reason: 'hmac-failed' })
    expect(verify({ hmac: () => null })).toMatchObject({ ok: false, reason: 'hmac-failed' })
  })
})

describe('livemodeOf', () => {
  it('reads the mode off the key, so there is no second variable to get wrong', () => {
    expect(livemodeOf('sk_live_abc')).toBe(true)
    expect(livemodeOf('sk_test_abc')).toBe(false)
    expect(livemodeOf('rk_live_abc')).toBe(true)
    expect(livemodeOf('rk_test_abc')).toBe(false)
  })

  it('is null for anything it cannot read', () => {
    // Null means "do not guess". A test-mode server applying a live event, or a
    // live one refusing real money, are both worse than refusing to decide.
    for (const key of ['', 'pk_live_abc', 'nonsense', null, undefined]) {
      expect(livemodeOf(key)).toBeNull()
    }
  })
})
