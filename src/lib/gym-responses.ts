import type { GymMessage } from './messages'

/**
 * The answer travelling back to the gym.
 *
 * Going, saved, reserved and joined were written to localStorage and stopped
 * there. The gym's reach panel added up the same arrays on the operator's own
 * machine, so it could only ever report that machine's clicks — zeroes that
 * read like "nobody came" when they meant "this never crossed the wire". The
 * gym is the paying side; a customer who cannot see what publishing bought
 * does not renew.
 *
 * One row per member per message, upserted. This module is the pure half:
 * which local state belongs on the wire, which messages still owe the server
 * a write, and how the gym's copies fold back into the device bus.
 */

/** Server-sourced ids are prefixed on the way in; the same holds for people. */
const SRV = 'srv-'

export const remoteKey = (userId: string): string => `${SRV}${userId}`

/** The bus id of a message that exists on the server, or null for a local one. */
export function serverMessageId(localId: string): string | null {
  return localId.startsWith(SRV) ? localId.slice(SRV.length) : null
}

export interface ResponseRow {
  id?: string
  /** Server id of the message, unprefixed. */
  message: string
  /** Server id of the member. */
  owner: string
  answer: '' | 'yes' | 'no'
  saved: boolean
  joined: boolean
  /** Opened at least once — the honest form of "reached". */
  opened: boolean
  member_name?: string
}

export type MyResponse = Pick<ResponseRow, 'answer' | 'saved' | 'joined' | 'opened'>

export const EMPTY_RESPONSE: MyResponse = { answer: '', saved: false, joined: false, opened: false }

/** What this device's profile currently says about one message. */
export function myResponse(message: GymMessage, profileId: string): MyResponse {
  return {
    answer: message.rsvp[profileId] ?? '',
    saved: message.saved.includes(profileId),
    joined: (message.joined ?? []).includes(profileId),
    opened: message.readBy.includes(profileId),
  }
}

export function sameResponse(a: MyResponse, b: MyResponse): boolean {
  return a.answer === b.answer && a.saved === b.saved && a.joined === b.joined && a.opened === b.opened
}

export const isEmptyResponse = (r: MyResponse): boolean => sameResponse(r, EMPTY_RESPONSE)

/* ------------------------------------------------------------------ dirty */

/**
 * Which messages this device has answered since it last reached the server.
 *
 * Without it the two directions fight: pull first and a fresh tap is
 * overwritten by the server's older copy; push first and a device that has
 * simply never answered pushes its emptiness over a real answer made
 * elsewhere. Only what was actually touched here is ours to send.
 */
const DIRTY_KEY = 'forma-response-dirty'

type DirtyMap = Record<string, string[]>

function readDirty(): DirtyMap {
  try {
    const raw = localStorage.getItem(DIRTY_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as DirtyMap) : {}
  } catch {
    return {}
  }
}

export function markResponseDirty(profileId: string, messageIds: string[]): void {
  const onServer = messageIds.filter((id) => serverMessageId(id))
  if (onServer.length === 0) return
  try {
    const all = readDirty()
    const mine = new Set([...(all[profileId] ?? []), ...onServer])
    localStorage.setItem(DIRTY_KEY, JSON.stringify({ ...all, [profileId]: [...mine] }))
  } catch {
    /* Private mode: the answer still shows here, it just never reaches the gym. */
  }
}

export function dirtyResponses(profileId: string): string[] {
  return readDirty()[profileId] ?? []
}

export function clearResponseDirty(profileId: string, messageIds: string[]): void {
  if (messageIds.length === 0) return
  try {
    const all = readDirty()
    const done = new Set(messageIds)
    const left = (all[profileId] ?? []).filter((id) => !done.has(id))
    localStorage.setItem(DIRTY_KEY, JSON.stringify({ ...all, [profileId]: left }))
  } catch {
    /* Same trade: it re-sends next time rather than being lost. */
  }
}

/* ------------------------------------------------------------------ apply */

/**
 * Fold the server's rows into the device bus.
 *
 * A member's own row lands under their local profile id, which is what the
 * card's "Saved"/"Going" state reads — that is how a second device recovers
 * what the first one answered. Everyone else's lands under `srv-<userId>`,
 * which is what turns the gym's tallies from its own clicks into its members'.
 *
 * `keepMine` is the set of messages answered here and not yet pushed; their
 * local answer wins, because it is newer than anything the server can know.
 */
export function applyResponses(
  messages: GymMessage[],
  rows: ResponseRow[],
  selfUserId: string,
  selfProfileId: string,
  keepMine: Set<string> = new Set(),
): GymMessage[] {
  if (rows.length === 0) return messages
  const byMessage = new Map<string, ResponseRow[]>()
  for (const row of rows) {
    const list = byMessage.get(row.message)
    if (list) list.push(row)
    else byMessage.set(row.message, [row])
  }

  return messages.map((message) => {
    const serverId = serverMessageId(message.id)
    if (!serverId) return message
    const rowsFor = byMessage.get(serverId)
    if (!rowsFor) return message

    const mineWins = keepMine.has(message.id)
    const local = myResponse(message, selfProfileId)

    /* Anything remote is rebuilt from this pull; anything local that is not a
       remote key is left alone, so a device with several profiles on it keeps
       the answers of the ones with no account. */
    const keepLocal = (id: string) => !id.startsWith(SRV) && id !== selfProfileId
    const readBy = message.readBy.filter(keepLocal)
    const saved = message.saved.filter(keepLocal)
    const joined = (message.joined ?? []).filter(keepLocal)
    const rsvp: Record<string, 'yes' | 'no'> = {}
    for (const [id, answer] of Object.entries(message.rsvp)) {
      if (keepLocal(id)) rsvp[id] = answer
    }
    const respondents: Record<string, string> = {}

    for (const row of rowsFor) {
      const self = row.owner === selfUserId
      if (self && mineWins) continue
      const key = self ? selfProfileId : remoteKey(row.owner)
      if (row.member_name) respondents[key] = row.member_name
      if (row.opened) readBy.push(key)
      if (row.saved) saved.push(key)
      if (row.joined) joined.push(key)
      if (row.answer === 'yes' || row.answer === 'no') rsvp[key] = row.answer
    }

    if (mineWins) {
      if (local.opened) readBy.push(selfProfileId)
      if (local.saved) saved.push(selfProfileId)
      if (local.joined) joined.push(selfProfileId)
      if (local.answer === 'yes' || local.answer === 'no') rsvp[selfProfileId] = local.answer
    }

    return {
      ...message,
      readBy,
      saved,
      rsvp,
      ...(joined.length > 0 || message.joined ? { joined } : {}),
      ...(Object.keys(respondents).length > 0 ? { respondents } : {}),
    }
  })
}

/** Members who said yes, by name, newest answer irrelevant — a guest list. */
export function guestList(message: GymMessage): string[] {
  const names = Object.entries(message.rsvp)
    .filter(([, answer]) => answer === 'yes')
    .map(([id]) => message.respondents?.[id])
    .filter((name): name is string => !!name)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}
