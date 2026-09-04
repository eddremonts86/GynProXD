import { describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/entitlement.js?raw'

/**
 * The server's own answer to "has this account paid", tested against the file
 * PocketBase actually loads.
 *
 * Same arrangement as `coach-host.spec.ts` and for the same reason: the
 * predicate lives in `pb_hooks/utils/` because that is where the server can
 * require it, which puts it outside everything the app's build touches, and a
 * money decision should not be the one rule here that nothing checks. A copy in
 * this file would keep passing while the shipped one drifted.
 *
 * The asymmetry every case below is written around: refusing a paying account
 * costs one support message. Admitting one that never paid is revenue that was
 * never charged, for a feature that cannot be taken back once used. Anything
 * unreadable, unparseable or absent resolves to "not paid".
 */
/* Pulled in with `?raw` and evaluated: the file is CommonJS because
   PocketBase's runtime requires it that way and this package is ESM. */
interface Shipped {
  dateText?: (value: unknown) => string
  parseInstant?: (text: string) => number
  isProAt?: (rawUntil: unknown, nowMs: number) => boolean
}
const shipped = { exports: {} as Shipped }
new Function('module', 'exports', source)(shipped, shipped.exports)
const dateText = shipped.exports.dateText!
const parseInstant = shipped.exports.parseInstant!
const isProAt = shipped.exports.isProAt!

/** What PocketBase writes into a date field, space and all. */
const PB_FORMAT = '2026-10-03 00:00:00.000Z'
const OCT_3 = Date.parse('2026-10-03T00:00:00.000Z')

describe('dateText', () => {
  it('takes a plain string as it stands', () => {
    expect(dateText(PB_FORMAT)).toBe(PB_FORMAT)
    expect(dateText(`  ${PB_FORMAT}  `)).toBe(PB_FORMAT)
  })

  it('asks the JSVM date type for its own string', () => {
    // This is the case that made the function exist. Inside PocketBase the
    // getter hands back a `types.DateTime`, and `String()` on one of those is
    // "[object Object]" — which parses to NaN and would have read as "not paid"
    // for every paying account on the server, while every test written against
    // the API's strings carried on passing.
    expect(dateText({ string: () => PB_FORMAT })).toBe(PB_FORMAT)
  })

  it('reads an empty date field as empty, in both of its shapes', () => {
    expect(dateText('')).toBe('')
    expect(dateText(null)).toBe('')
    expect(dateText(undefined)).toBe('')
    expect(dateText({ string: () => '' })).toBe('')
  })

  it('refuses to invent text for an object it cannot ask', () => {
    expect(dateText({})).toBe('')
    expect(dateText({ pro_until: PB_FORMAT })).toBe('')
  })

  it('survives a date type that throws when asked', () => {
    expect(
      dateText({
        string: () => {
          throw new Error('nope')
        },
      }),
    ).toBe('')
  })
})

describe('parseInstant', () => {
  it('reads the format PocketBase writes', () => {
    expect(parseInstant(PB_FORMAT)).toBe(OCT_3)
  })

  it('reads a proper ISO instant too', () => {
    // What the grant script sends and what an export would carry.
    expect(parseInstant('2026-10-03T00:00:00.000Z')).toBe(OCT_3)
  })

  it('treats a value with no zone as UTC, which is what PocketBase meant', () => {
    // Guessing local time instead would move the boundary by up to a day in
    // whichever direction the server happens to be configured, so the same
    // stored row would answer differently on two machines.
    expect(parseInstant('2026-10-03 00:00:00.000')).toBe(OCT_3)
    expect(parseInstant('2026-10-03')).toBe(OCT_3)
  })

  it('keeps an explicit offset', () => {
    expect(parseInstant('2026-10-03 02:00:00.000+02:00')).toBe(OCT_3)
  })

  it('is NaN for empty and for rubbish', () => {
    expect(Number.isNaN(parseInstant(''))).toBe(true)
    expect(Number.isNaN(parseInstant('soon'))).toBe(true)
    expect(Number.isNaN(parseInstant('[object Object]'))).toBe(true)
  })
})

describe('isProAt', () => {
  it('is paid while the date is ahead', () => {
    expect(isProAt(PB_FORMAT, OCT_3 - 1)).toBe(true)
    expect(isProAt(PB_FORMAT, OCT_3 - 30 * 86_400_000)).toBe(true)
  })

  it('is over on the second it names', () => {
    // Strictly greater than. Rounding a lapse up to the rest of the day is not
    // a disaster and is also not what the field says.
    expect(isProAt(PB_FORMAT, OCT_3)).toBe(false)
    expect(isProAt(PB_FORMAT, OCT_3 + 1)).toBe(false)
  })

  it('reads the JSVM date type, not just the string', () => {
    expect(isProAt({ string: () => PB_FORMAT }, OCT_3 - 1)).toBe(true)
    expect(isProAt({ string: () => PB_FORMAT }, OCT_3 + 1)).toBe(false)
  })

  it('is not paid for every way the field can be absent or broken', () => {
    const now = OCT_3 - 1
    for (const value of ['', null, undefined, {}, 'soon', 0, false, [], { string: () => '' }]) {
      expect(isProAt(value, now)).toBe(false)
    }
  })
})
