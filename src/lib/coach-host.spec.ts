import { describe, expect, it } from 'vitest'
import source from '../../deploy/pocketbase/pb_hooks/utils/coach_host.js?raw'

/**
 * The predicate behind a privacy statement, tested against the file the server
 * actually loads rather than a copy of it.
 *
 * It lives in `deploy/pocketbase/pb_hooks/utils/` because that is where
 * PocketBase can `require` it, which puts it outside anything the app's own
 * build touches — and a rule that decides whether somebody is told "this does
 * not reach a third party" should not be the one rule in the repository nothing
 * checks. Requiring the real path is the point: a copy here would pass forever
 * while the shipped one drifted.
 *
 * The asymmetry worth stating: being wrong towards `external` costs a member a
 * warning they did not need. Being wrong towards `self` tells them their injury
 * stayed on our hardware when it went to a vendor. Every ambiguous case below
 * resolves to `external` for that reason.
 */
/* Pulled in with `?raw` and evaluated, rather than imported: the file is
   CommonJS because PocketBase's runtime requires it that way, and this package
   is ESM, so a normal import cannot load it. Taking the bytes is also the
   stricter test — a shim would keep passing while the shipped file drifted. */
const shipped = { exports: {} as { coachHostFor?: (base: string) => 'self' | 'external' } }
new Function('module', 'exports', source)(shipped, shipped.exports)
const coachHostFor = shipped.exports.coachHostFor!

describe('coachHostFor', () => {
  it('calls a public vendor external', () => {
    expect(coachHostFor('https://api.minimaxi.chat/v1')).toBe('external')
    expect(coachHostFor('https://api.openai.com/v1')).toBe('external')
    expect(coachHostFor('https://generativelanguage.googleapis.com')).toBe('external')
  })

  it('calls loopback ours', () => {
    expect(coachHostFor('http://localhost:11434/v1')).toBe('self')
    expect(coachHostFor('http://127.0.0.1:11434/v1')).toBe('self')
  })

  it('calls the private ranges ours', () => {
    expect(coachHostFor('http://10.0.3.14:11434/v1')).toBe('self')
    expect(coachHostFor('http://192.168.1.20:11434/v1')).toBe('self')
    expect(coachHostFor('http://172.16.0.9:11434/v1')).toBe('self')
    expect(coachHostFor('http://172.31.255.1:11434/v1')).toBe('self')
  })

  it('does not mistake a public address that merely starts like a private one', () => {
    // 172.15 and 172.32 are outside the private block. A regex that stopped at
    // `^172\\.` would hand a vendor the reassuring sentence.
    expect(coachHostFor('http://172.15.0.1/v1')).toBe('external')
    expect(coachHostFor('http://172.32.0.1/v1')).toBe('external')
    // And 100.x is carrier-grade NAT, not a private range we control.
    expect(coachHostFor('http://100.64.0.1/v1')).toBe('external')
  })

  it('calls a bare container name ours', () => {
    // How one service reaches another on the same compose network.
    expect(coachHostFor('http://ollama:11434/v1')).toBe('self')
    expect(coachHostFor('http://hunterready-llm:11434/v1')).toBe('self')
  })

  it('calls .local and .internal ours', () => {
    expect(coachHostFor('http://llm.internal/v1')).toBe('self')
    expect(coachHostFor('http://box.local:8080/v1')).toBe('self')
  })

  it('treats anything it cannot read as external', () => {
    expect(coachHostFor('')).toBe('external')
    expect(coachHostFor('   ')).toBe('external')
    expect(coachHostFor('not a url at all with spaces.com/x')).toBe('external')
  })

  it('is not fooled by a private-looking name inside a public host', () => {
    expect(coachHostFor('https://localhost.evil.com/v1')).toBe('external')
    expect(coachHostFor('https://internal.example.com/v1')).toBe('external')
    // A path segment is not a host.
    expect(coachHostFor('https://api.vendor.com/localhost/v1')).toBe('external')
  })

  it('reads an IPv6 loopback in its bracketed form', () => {
    expect(coachHostFor('http://[::1]:11434/v1')).toBe('self')
  })
})
