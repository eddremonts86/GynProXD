/**
 * What the sync server can do for this install (phase 7). The build flags
 * still say what the DEV proxy carries; these runtime flags say what the
 * server carries, so production UI only promises an AI coach or recipe
 * search that actually exists. Cached in localStorage so the app boots with
 * yesterday's truth instead of none, then refreshed in the background.
 */

export type CoachHost = 'self' | 'external'

export interface ServerCapabilities {
  coach: boolean
  /**
   * Where the coach runs, when there is one.
   *
   * The intake sends what somebody typed to whichever model designs the
   * programme, and only the server knows which. Absent on a server that has not
   * been redeployed since this existed — and absent is read as `external`
   * everywhere it is used, because the wrong way to be wrong is to promise
   * somebody their words stayed home when they did not.
   */
  coachHost: CoachHost | null
  recipes: boolean
  /** An events source (a Ticketmaster key) behind /api/enforma/events/near. */
  events: boolean
  /** VAPID public key when the server can deliver Web Push, else null. */
  push: string | null
  /**
   * Whether this server can take a card: a Stripe key and a price id, both.
   *
   * Absent reads as false, like every other flag here. The direction to be
   * wrong in is a member not being offered a subscription, rather than a button
   * that opens a checkout for nothing.
   */
  billing: boolean
  /** Stripe's hosted billing portal, where cancelling happens. Null when unset. */
  portal: string | null
}

const CACHE_KEY = 'forma-caps'
const NONE: ServerCapabilities = {
  coach: false,
  coachHost: null,
  recipes: false,
  events: false,
  push: null,
  billing: false,
  portal: null,
}

let caps: ServerCapabilities = load()

function load(): ServerCapabilities {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return NONE
    const parsed = JSON.parse(raw) as Partial<ServerCapabilities>
    return {
      coach: parsed.coach === true,
      coachHost: parsed.coachHost === 'self' ? 'self' : parsed.coachHost === 'external' ? 'external' : null,
      recipes: parsed.recipes === true,
      events: parsed.events === true,
      push: typeof parsed.push === 'string' ? parsed.push : null,
      billing: parsed.billing === true,
      portal: typeof parsed.portal === 'string' ? parsed.portal : null,
    }
  } catch {
    return NONE
  }
}

export function serverCapabilities(): ServerCapabilities {
  return caps
}

/**
 * Whoever is drawing from `caps` right now.
 *
 * The refresh below lands after the first render of whatever screen asked, and
 * a module variable changing tells React nothing. A screen that read "no coach"
 * a moment before the answer arrived stayed that way until something else made
 * it draw again, which on a quiet screen was never. Subscribers get told.
 */
const listeners = new Set<() => void>()

export function subscribeCapabilities(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Asks the server what it can do. Quiet on failure: capabilities only grow. */
export async function refreshCapabilities(server = '/pb'): Promise<void> {
  try {
    const base = server.trim().replace(/\/+$/, '') || '/pb'
    const res = await fetch(`${base}/api/enforma/capabilities`, {
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return
    const parsed = (await res.json()) as Partial<ServerCapabilities>
    caps = {
      coach: parsed.coach === true,
      coachHost:
        parsed.coachHost === 'self' ? 'self' : parsed.coachHost === 'external' ? 'external' : null,
      recipes: parsed.recipes === true,
      events: parsed.events === true,
      push: typeof parsed.push === 'string' && parsed.push.length > 0 ? parsed.push : null,
      billing: parsed.billing === true,
      portal:
        typeof parsed.portal === 'string' && parsed.portal.length > 0 ? parsed.portal : null,
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(caps))
    } catch {
      /* Private mode: the next boot just probes again. */
    }
    for (const listener of listeners) listener()
  } catch {
    /* Offline or no server: the cached answer stands. */
  }
}
