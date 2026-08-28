/**
 * What the sync server can do for this install (phase 7). The build flags
 * still say what the DEV proxy carries; these runtime flags say what the
 * server carries, so production UI only promises an AI coach or recipe
 * search that actually exists. Cached in localStorage so the app boots with
 * yesterday's truth instead of none, then refreshed in the background.
 */

export interface ServerCapabilities {
  coach: boolean
  recipes: boolean
  /** VAPID public key when the server can deliver Web Push, else null. */
  push: string | null
}

const CACHE_KEY = 'forma-caps'
const NONE: ServerCapabilities = { coach: false, recipes: false, push: null }

let caps: ServerCapabilities = load()

function load(): ServerCapabilities {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return NONE
    const parsed = JSON.parse(raw) as Partial<ServerCapabilities>
    return {
      coach: parsed.coach === true,
      recipes: parsed.recipes === true,
      push: typeof parsed.push === 'string' ? parsed.push : null,
    }
  } catch {
    return NONE
  }
}

export function serverCapabilities(): ServerCapabilities {
  return caps
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
      recipes: parsed.recipes === true,
      push: typeof parsed.push === 'string' && parsed.push.length > 0 ? parsed.push : null,
    }
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(caps))
    } catch {
      /* Private mode: the next boot just probes again. */
    }
  } catch {
    /* Offline or no server: the cached answer stands. */
  }
}
