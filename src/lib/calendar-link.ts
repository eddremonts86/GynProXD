import { accountBase } from './account-base'
import { activeAuthHeader } from './sync'
import type { BusyBlock } from './life-profile'

/**
 * The account's connected calendar, from this device's point of view.
 *
 * Every call goes to the account's own server, which is the only thing that
 * holds the token. Nothing here can see it and nothing here caches events: a
 * pull asks for the next three weeks and hands them straight to the store,
 * where they live encrypted on the device with the rest of the day.
 *
 * The shapes are checked rather than trusted, the same way `nearby-events.ts`
 * checks the events route. A block whose times are not clock times is dropped
 * rather than drawn on somebody's day at an hour that does not exist.
 */

export interface CalendarStatus {
  connected: boolean
  account: string
  lastSynced: string | null
}

export type CalendarFailure =
  | 'no-account'
  | 'unavailable'
  | 'refused'
  | 'not-connected'
  | 'withdrawn'
  | 'unreachable'

export type PullResult =
  | { ok: true; blocks: Omit<BusyBlock, 'id'>[] }
  | { ok: false; why: CalendarFailure }

const TIMEOUT_MS = 30_000
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function endpoint(): { base: string; headers: Record<string, string> } | null {
  const base = accountBase()
  const headers = activeAuthHeader()
  return base && headers ? { base, headers } : null
}

/** Whatever survives the gate: dated, clocked, ending after it starts. */
export function validateBlocks(raw: unknown): Omit<BusyBlock, 'id'>[] | null {
  const body = raw as { blocks?: unknown } | null
  if (!body || !Array.isArray(body.blocks)) return null
  const out: Omit<BusyBlock, 'id'>[] = []
  for (const entry of body.blocks.slice(0, 250)) {
    const item = entry as Record<string, unknown> | null
    if (!item) continue
    const { date, start, end, title } = item
    if (typeof date !== 'string' || !DATE.test(date)) continue
    if (typeof start !== 'string' || !CLOCK.test(start)) continue
    if (typeof end !== 'string' || !CLOCK.test(end)) continue
    if (end <= start) continue
    const label = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
    out.push({ date, start, end, source: 'google', ...(label ? { label } : {}) })
  }
  return out
}

export async function calendarStatus(): Promise<CalendarStatus> {
  const at = endpoint()
  if (!at) return { connected: false, account: '', lastSynced: null }
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/status`, {
      headers: at.headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { connected: false, account: '', lastSynced: null }
    const body = (await res.json()) as Record<string, unknown>
    return {
      connected: body.connected === true,
      account: typeof body.account === 'string' ? body.account : '',
      lastSynced: typeof body.lastSynced === 'string' ? body.lastSynced : null,
    }
  } catch {
    return { connected: false, account: '', lastSynced: null }
  }
}

/**
 * Where to send the browser to say yes to Google.
 *
 * A URL rather than a redirect this code follows, because the consent screen is
 * Google's own page and the member has to see the address bar say so. The
 * caller navigates; nothing is stored on the way out.
 */
export async function calendarConnectUrl(): Promise<{ url: string } | { why: CalendarFailure }> {
  const at = endpoint()
  if (!at) return { why: 'no-account' }
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/google/start`, {
      method: 'POST',
      headers: at.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 503) return { why: 'unavailable' }
    if (res.status === 401 || res.status === 403) return { why: 'refused' }
    if (!res.ok) return { why: 'unreachable' }
    const body = (await res.json()) as { url?: unknown }
    if (typeof body.url !== 'string' || !/^https?:\/\//.test(body.url)) return { why: 'unreachable' }
    return { url: body.url }
  } catch {
    return { why: 'unreachable' }
  }
}

export async function pullCalendar(keepTitles: boolean): Promise<PullResult> {
  const at = endpoint()
  if (!at) return { ok: false, why: 'no-account' }
  try {
    const res = await fetch(
      `${at.base}/api/enforma/calendar/busy${keepTitles ? '?titles=1' : ''}`,
      { headers: at.headers, signal: AbortSignal.timeout(TIMEOUT_MS) },
    )
    if (res.status === 503) return { ok: false, why: 'unavailable' }
    if (res.status === 401 || res.status === 403) return { ok: false, why: 'refused' }
    if (res.status === 404) return { ok: false, why: 'not-connected' }
    if (res.status === 409) return { ok: false, why: 'withdrawn' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const blocks = validateBlocks(await res.json())
    if (!blocks) return { ok: false, why: 'unreachable' }
    return { ok: true, blocks }
  } catch {
    return { ok: false, why: 'unreachable' }
  }
}

export async function disconnectCalendar(): Promise<boolean> {
  const at = endpoint()
  if (!at) return false
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/disconnect`, {
      method: 'POST',
      headers: at.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}
