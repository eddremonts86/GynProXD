import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyResponses,
  clearResponseDirty,
  dirtyResponses,
  guestList,
  markResponseDirty,
  myResponse,
  remoteKey,
  sameResponse,
  serverMessageId,
  type ResponseRow,
} from './gym-responses'
import type { GymMessage } from './messages'

const msg = (over: Partial<GymMessage>): GymMessage => ({
  id: 'srv-abc',
  gym: 'Nordhavn Strength',
  authorId: 'srv-op1',
  createdAt: '2026-08-30T10:00:00.000Z',
  kind: 'event',
  title: 'Deadlift clinic',
  audience: 'all',
  readBy: [],
  rsvp: {},
  saved: [],
  ...over,
})

const row = (over: Partial<ResponseRow>): ResponseRow => ({
  message: 'abc',
  owner: 'u-other',
  answer: '',
  saved: false,
  joined: false,
  opened: false,
  ...over,
})

const ME = 'p-local'
const MY_USER = 'u-me'

/**
 * The suite runs on plain Node, which has no localStorage; the module under
 * test swallows that in a try/catch, so without a stand-in the dirty-set
 * assertions would pass against a no-op.
 */
function useMemoryStorage(): void {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

describe('which messages exist on the server', () => {
  it('unwraps a server id', () => {
    expect(serverMessageId('srv-abc')).toBe('abc')
  })

  it('refuses a device-only message, which has nowhere to send an answer', () => {
    expect(serverMessageId('msg-1756-xyz')).toBeNull()
  })
})

describe('what this device has to say', () => {
  it('reads the local profile out of the arrays', () => {
    const m = msg({ rsvp: { [ME]: 'yes' }, saved: [ME], readBy: [ME] })
    expect(myResponse(m, ME)).toEqual({ answer: 'yes', saved: true, joined: false, opened: true })
  })

  it('reports nothing for a message this profile never touched', () => {
    const m = msg({ rsvp: { 'p-other': 'yes' }, saved: ['p-other'] })
    expect(myResponse(m, ME)).toEqual({ answer: '', saved: false, joined: false, opened: false })
  })

  it('treats a changed answer as different', () => {
    const a = { answer: 'yes' as const, saved: false, joined: false, opened: true }
    expect(sameResponse(a, { ...a, answer: 'no' })).toBe(false)
    expect(sameResponse(a, { ...a })).toBe(true)
  })
})

describe('what still owes the gym a write', () => {
  beforeEach(useMemoryStorage)

  it('remembers a message answered here', () => {
    markResponseDirty(ME, ['srv-abc'])
    expect(dirtyResponses(ME)).toEqual(['srv-abc'])
  })

  it('ignores a device-only message: there is no row to write', () => {
    markResponseDirty(ME, ['msg-local'])
    expect(dirtyResponses(ME)).toEqual([])
  })

  it('does not list the same message twice', () => {
    markResponseDirty(ME, ['srv-abc'])
    markResponseDirty(ME, ['srv-abc', 'srv-def'])
    expect(dirtyResponses(ME).sort()).toEqual(['srv-abc', 'srv-def'])
  })

  it('forgets one once it has been sent, and keeps the rest', () => {
    markResponseDirty(ME, ['srv-abc', 'srv-def'])
    clearResponseDirty(ME, ['srv-abc'])
    expect(dirtyResponses(ME)).toEqual(['srv-def'])
  })

  it('keeps one profile out of another’s queue', () => {
    markResponseDirty(ME, ['srv-abc'])
    expect(dirtyResponses('p-someone-else')).toEqual([])
  })
})

describe('folding the gym’s answers back in', () => {
  it('counts another member under a server key, with their name', () => {
    const [m] = applyResponses(
      [msg({})],
      [row({ owner: 'u-other', answer: 'yes', opened: true, member_name: 'Marta Quintela' })],
      MY_USER,
      ME,
    )
    expect(m.rsvp).toEqual({ [remoteKey('u-other')]: 'yes' })
    expect(m.readBy).toEqual([remoteKey('u-other')])
    expect(m.respondents).toEqual({ [remoteKey('u-other')]: 'Marta Quintela' })
  })

  it('lands this account’s own row on the local profile, so the card reads as saved', () => {
    const [m] = applyResponses(
      [msg({ kind: 'offer' })],
      [row({ owner: MY_USER, saved: true, opened: true })],
      MY_USER,
      ME,
    )
    expect(m.saved).toEqual([ME])
  })

  it('lets an answer made a second ago beat the server copy it has not reached yet', () => {
    const local = msg({ kind: 'offer', saved: [ME] })
    const [m] = applyResponses(
      [local],
      [row({ owner: MY_USER, saved: false })],
      MY_USER,
      ME,
      new Set(['srv-abc']),
    )
    expect(m.saved).toEqual([ME])
  })

  it('takes the server copy when nothing was touched here', () => {
    const local = msg({ kind: 'offer', saved: [ME] })
    const [m] = applyResponses([local], [row({ owner: MY_USER, saved: false })], MY_USER, ME)
    expect(m.saved).toEqual([])
  })

  it('leaves a local-only profile on the same device alone', () => {
    const local = msg({ kind: 'offer', saved: ['p-housemate'] })
    const [m] = applyResponses(
      [local],
      [row({ owner: 'u-other', saved: true })],
      MY_USER,
      ME,
    )
    expect(m.saved.sort()).toEqual([remoteKey('u-other'), 'p-housemate'].sort())
  })

  it('never rebuilds a message that only exists on this device', () => {
    const local = msg({ id: 'msg-local', saved: ['p-housemate'] })
    const [m] = applyResponses([local], [row({ message: 'msg-local', saved: true })], MY_USER, ME)
    expect(m).toBe(local)
  })

  it('does not double-count a member across two pulls', () => {
    const rows = [row({ owner: 'u-other', answer: 'yes', opened: true })]
    const once = applyResponses([msg({})], rows, MY_USER, ME)
    const twice = applyResponses(once, rows, MY_USER, ME)
    expect(twice[0].readBy).toEqual([remoteKey('u-other')])
    expect(Object.keys(twice[0].rsvp)).toHaveLength(1)
  })
})

describe('the door list', () => {
  it('names only the members who said yes', () => {
    const m = msg({
      rsvp: { a: 'yes', b: 'no', c: 'yes' },
      respondents: { a: 'Marta Quintela', b: 'Iker Salaberri', c: 'Nuria Bastos' },
    })
    expect(guestList(m)).toEqual(['Marta Quintela', 'Nuria Bastos'])
  })

  it('is empty when the answers arrived without names', () => {
    expect(guestList(msg({ rsvp: { a: 'yes' } }))).toEqual([])
  })
})
