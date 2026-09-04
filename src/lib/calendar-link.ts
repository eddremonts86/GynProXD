import { accountBase } from './account-base'
import { activeAuthHeader } from './sync'
import { parseIcs } from './ics'
import { IMPORT_DAYS, type BusyBlock } from './life-profile'
import { todayIso } from './dates'
import { isoPlusDays } from './day-window'

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
 *
 * ## The two providers answer differently, on purpose
 *
 * Google's route hands back busy blocks: its API returns every instance with
 * its own UTC offset, so the server can turn them into wall-clock hours and be
 * right across a daylight-saving change.
 *
 * Apple's hands back raw `VCALENDAR` text, because CalDAV does not. Expanding
 * recurrences server-side would force UTC on the answer, and turning UTC into
 * somebody's wall clock needs the timezone database this device has and that
 * process does not. So the recurrence rules arrive as written and `parseIcs`
 * resolves them here — the same parser, with the same decisions about all-day
 * events and free-marked hours, that has read picked files since v1.
 */

export type CalendarProvider = 'google' | 'apple' | 'microsoft'

export interface CalendarStatus {
  connected: boolean
  account: string
  lastSynced: string | null
  /**
   * When the provider last said this calendar changed, with no read since.
   *
   * Google only, and only where the server holds a watch channel: it is set by
   * a notification and cleared by the read that answers it. `null` means there
   * is nothing outstanding, which is also what a provider that cannot push
   * always says.
   */
  changed: string | null
}

export type CalendarStatuses = Record<CalendarProvider, CalendarStatus>

const NOT_CONNECTED: CalendarStatus = { connected: false, account: '', lastSynced: null, changed: null }

export type CalendarFailure =
  | 'no-account'
  | 'unavailable'
  | 'refused'
  | 'not-connected'
  | 'withdrawn'
  | 'unreachable'
  /** Apple only: the Apple ID or the app-specific password was not accepted. */
  | 'rejected'

export type PullResult =
  | { ok: true; blocks: Omit<BusyBlock, 'id'>[] }
  | { ok: false; why: CalendarFailure }

const TIMEOUT_MS = 30_000

/**
 * Whether event titles are kept, on this device.
 *
 * The switch says "on this device" and it used to live in component state,
 * which meant it said one thing and did another: a reload forgot it, and the
 * round trip through Google's consent screen is a reload. It is a preference
 * about what this device stores, so it is stored here — `localStorage`, never
 * synced, because the answer belongs to the device rather than to the account.
 *
 * Not sensitive in itself: it says nothing about anybody, only about what they
 * would rather have written down.
 */
const TITLES_KEY = 'forma-calendar-titles'

export function keepTitlesStored(): boolean {
  try {
    return localStorage.getItem(TITLES_KEY) === 'yes'
  } catch {
    return false
  }
}

export function setKeepTitlesStored(keep: boolean): void {
  try {
    if (keep) localStorage.setItem(TITLES_KEY, 'yes')
    else localStorage.removeItem(TITLES_KEY)
  } catch {
    /* Private mode: the switch still works for this session. */
  }
}
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function endpoint(): { base: string; headers: Record<string, string> } | null {
  const base = accountBase()
  const headers = activeAuthHeader()
  return base && headers ? { base, headers } : null
}

/** Whatever survives the gate: dated, clocked, ending after it starts. */
export function validateBlocks(
  raw: unknown,
  source: 'google' | 'microsoft' = 'google',
): Omit<BusyBlock, 'id'>[] | null {
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
    out.push({ date, start, end, source, ...(label ? { label } : {}) })
  }
  return out
}

function oneStatus(raw: unknown): CalendarStatus {
  if (!raw || typeof raw !== 'object') return NOT_CONNECTED
  const row = raw as Record<string, unknown>
  return {
    connected: row.connected === true,
    account: typeof row.account === 'string' ? row.account : '',
    lastSynced: typeof row.lastSynced === 'string' ? row.lastSynced : null,
    /* Absent from a server that predates the channel, which reads as "no
       news" — the same as a server that has one and nothing to report. */
    changed: typeof row.changed === 'string' && row.changed !== '' ? row.changed : null,
  }
}

/**
 * What each provider says about itself, or **null when it could not be asked**.
 *
 * The difference matters and it is why this does not fall back to "nothing is
 * connected". A caller acts on a disconnected provider by dropping the blocks
 * it mirrored, and doing that because the network was down for a second would
 * delete somebody's day for no reason. No account is a real answer — nothing
 * can be connected without one — and a failed request is not an answer at all.
 *
 * A server too old to answer per provider sends the flat shape it always did,
 * which is read as Google's, because Google was the only one it could have
 * meant.
 */
export async function calendarStatuses(): Promise<CalendarStatuses | null> {
  const none: CalendarStatuses = {
    google: NOT_CONNECTED,
    apple: NOT_CONNECTED,
    microsoft: NOT_CONNECTED,
  }
  const at = endpoint()
  if (!at) return none
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/status`, {
      headers: at.headers,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as Record<string, unknown>
    const providers = body.providers as Record<string, unknown> | undefined
    if (providers) {
      return {
        google: oneStatus(providers.google),
        apple: oneStatus(providers.apple),
        microsoft: oneStatus(providers.microsoft),
      }
    }
    return { ...none, google: oneStatus(body) }
  } catch {
    return null
  }
}

/**
 * Where to send the browser to say yes, for a provider that has a consent
 * screen.
 *
 * A URL rather than a redirect this code follows, because the screen is
 * Google's or Microsoft's own page and the member has to see the address bar
 * say so. The caller navigates; nothing is stored on the way out.
 */
export async function calendarConnectUrl(
  provider: 'google' | 'microsoft' = 'google',
): Promise<{ url: string } | { why: CalendarFailure }> {
  const at = endpoint()
  if (!at) return { why: 'no-account' }
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/${provider}/start`, {
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

/**
 * The window the Apple read covers, as `parseIcs` wants it: the same three
 * weeks the server asked iCloud for and the same the file import reads.
 */
export function icsWindow(today = todayIso()): { from: string; to: string } {
  return { from: today, to: isoPlusDays(today, IMPORT_DAYS, today) }
}

/** Whatever the relayed iCalendar text holds, as busy blocks. Exported for its tests. */
export function blocksFromIcs(
  texts: readonly string[],
  keepTitles: boolean,
  today = todayIso(),
): Omit<BusyBlock, 'id'>[] {
  const window = icsWindow(today)
  const out: Omit<BusyBlock, 'id'>[] = []
  const seen = new Set<string>()
  for (const text of texts) {
    for (const event of parseIcs(text, window)) {
      const key = `${event.date}|${event.start}|${event.end}`
      if (seen.has(key)) continue
      seen.add(key)
      const label = keepTitles ? event.title.replace(/\s+/g, ' ').trim().slice(0, 60) : ''
      out.push({
        date: event.date,
        start: event.start,
        end: event.end,
        source: 'apple',
        ...(label ? { label } : {}),
      })
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  return out
}

/**
 * Connects an iCloud calendar, verified before it is stored.
 *
 * The password is an app-specific one the member generated in their Apple ID
 * settings, which is the only kind iCloud accepts here. It goes straight to
 * their own server over TLS and is sealed there; nothing keeps it on this
 * device, not even for the length of the session.
 */
export async function connectApple(
  appleId: string,
  password: string,
): Promise<{ ok: true; account: string } | { ok: false; why: CalendarFailure }> {
  const at = endpoint()
  if (!at) return { ok: false, why: 'no-account' }
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/apple/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...at.headers },
      body: JSON.stringify({ appleId: appleId.trim(), password: password.trim() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 503) return { ok: false, why: 'unavailable' }
    if (res.status === 403) return { ok: false, why: 'refused' }
    if (res.status === 400 || res.status === 401) return { ok: false, why: 'rejected' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const body = (await res.json()) as { account?: unknown }
    return { ok: true, account: typeof body.account === 'string' ? body.account : appleId }
  } catch {
    return { ok: false, why: 'unreachable' }
  }
}

/** The next three weeks of the connected iCloud calendars, as busy blocks. */
export async function pullApple(keepTitles: boolean): Promise<PullResult> {
  const at = endpoint()
  if (!at) return { ok: false, why: 'no-account' }
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/apple/ics`, {
      headers: at.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 503) return { ok: false, why: 'unavailable' }
    if (res.status === 401 || res.status === 403) return { ok: false, why: 'refused' }
    if (res.status === 404) return { ok: false, why: 'not-connected' }
    if (res.status === 409) return { ok: false, why: 'withdrawn' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const body = (await res.json()) as { ics?: unknown }
    if (!Array.isArray(body.ics)) return { ok: false, why: 'unreachable' }
    const texts = body.ics.filter((text): text is string => typeof text === 'string')
    return { ok: true, blocks: blocksFromIcs(texts, keepTitles) }
  } catch {
    return { ok: false, why: 'unreachable' }
  }
}

/**
 * The zone this device is in, for the one provider that needs telling.
 *
 * Graph hands back naive times and a zone name rather than an offset per
 * instance, so the expansion has to be asked for in the member's own zone or
 * the hours arrive as UTC. `utils/microsoft_calendar.js` says why that is the
 * right trade; this is the half of it the browser can answer.
 */
function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** The next three weeks of the connected Microsoft calendar, as busy blocks. */
export async function pullMicrosoft(keepTitles: boolean): Promise<PullResult> {
  const at = endpoint()
  if (!at) return { ok: false, why: 'no-account' }
  const params = new URLSearchParams({ tz: localZone() })
  if (keepTitles) params.set('titles', '1')
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/microsoft/busy?${params}`, {
      headers: at.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (res.status === 503) return { ok: false, why: 'unavailable' }
    if (res.status === 401 || res.status === 403) return { ok: false, why: 'refused' }
    if (res.status === 404) return { ok: false, why: 'not-connected' }
    if (res.status === 409) return { ok: false, why: 'withdrawn' }
    if (!res.ok) return { ok: false, why: 'unreachable' }
    const blocks = validateBlocks(await res.json(), 'microsoft')
    if (!blocks) return { ok: false, why: 'unreachable' }
    return { ok: true, blocks }
  } catch {
    return { ok: false, why: 'unreachable' }
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

export async function disconnectCalendar(provider: CalendarProvider = 'google'): Promise<boolean> {
  const at = endpoint()
  if (!at) return false
  try {
    const res = await fetch(`${at.base}/api/enforma/calendar/disconnect?provider=${provider}`, {
      method: 'POST',
      headers: at.headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}
