import { beforeAll, describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/oauth_state.js?raw'

/**
 * The signed state, against the file PocketBase loads.
 *
 * This is the whole identity check on the two callbacks that arrive with no
 * session, so a forged or expired one has to be refused. It used to be tested
 * inside `google-calendar.spec.ts`; it moved out with the code when Microsoft
 * became the second provider to need it.
 */
interface Shipped {
  STATE_TTL_MS: number
  signState: (userId: string, expiresAtMs: number, secret: string) => string
  verifyState: (state: string, secret: string, nowMs: number) => string | null
}

const shipped = { exports: {} as Shipped }
let oauth: Shipped

beforeAll(() => {
  /* `$security` is a runtime global in PocketBase. A stand-in with the same
     shape is enough: what is under test is that the state is signed over the
     body and compared whole, not the strength of an HMAC Go already tests.
     No dots in the output, because the state is three dot-separated parts and
     a MAC carrying one would split into four and be rejected for the wrong
     reason. */
  ;(globalThis as unknown as { $security: unknown }).$security = {
    hs256: (data: string, secret: string) =>
      `mac${data}with${secret}`.replace(/[^a-z0-9]/gi, ''),
    equal: (a: string, b: string) => a === b,
  }
  new Function('module', 'exports', source)(shipped, shipped.exports)
  oauth = shipped.exports
})

describe('the signed state', () => {
  const secret = 'x'.repeat(32)
  const now = Date.UTC(2026, 8, 4, 12, 0, 0)

  it('comes back as the account that started the flow', () => {
    const state = oauth.signState('user123', now + 60_000, secret)
    expect(oauth.verifyState(state, secret, now)).toBe('user123')
  })

  it('refuses one signed with another secret', () => {
    const state = oauth.signState('user123', now + 60_000, secret)
    expect(oauth.verifyState(state, 'y'.repeat(32), now)).toBeNull()
  })

  it('refuses one whose account was swapped after signing', () => {
    const state = oauth.signState('user123', now + 60_000, secret)
    expect(oauth.verifyState(state.replace('user123', 'someone-else'), secret, now)).toBeNull()
  })

  it('refuses one that has expired', () => {
    expect(oauth.verifyState(oauth.signState('user123', now - 1, secret), secret, now)).toBeNull()
  })

  it('refuses nonsense rather than throwing', () => {
    expect(oauth.verifyState('', secret, now)).toBeNull()
    expect(oauth.verifyState('a.b', secret, now)).toBeNull()
    expect(oauth.verifyState('a.b.c.d', secret, now)).toBeNull()
  })

  it('is good for ten minutes, which is one trip through a consent screen', () => {
    expect(oauth.STATE_TTL_MS).toBe(10 * 60 * 1000)
  })
})
