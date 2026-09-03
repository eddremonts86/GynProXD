import { useSession } from '../store/useSession'
import { activeAuthHeader, readSyncLink } from './sync'

/**
 * Whether this account has paid, decided on the device.
 *
 * A local-first app cannot ask a server before it will draw a screen, so this
 * is shaped like `capabilities.ts`: ask, cache, and boot on yesterday's answer.
 * The difference is what the answer is about. Capabilities are a property of
 * the server and the same for everybody, so they live under one key. This is a
 * property of one account, and a device can hold several profiles linked to
 * several accounts, so it is keyed per profile like the sync link itself.
 *
 * The interesting part is the grace window, and it exists for exactly one
 * situation: the device cannot reach the server, so the cached date may be
 * behind a renewal that has already happened. It must NOT cover the situation
 * where the server was reached and said the subscription is over. `decide`
 * separates those by asking whether the date was still ahead at the moment we
 * last managed to ask.
 *
 * None of this is a security boundary and it is not pretending to be one.
 * Anybody can write localStorage. The gate that costs money is on the server,
 * on the routes that spend money; this one decides which screens to draw, and
 * the worst a forged flag buys is a view of something that does not work yet.
 */

const KEY_PREFIX = 'forma-pro-'

/**
 * How long a device may keep a lapsed date alive while it cannot ask.
 *
 * Two weeks. Long enough for a holiday with no signal, short enough that a
 * cancelled subscription does not run for a month on a phone that never goes
 * online. Nothing renews on this schedule, so the number is a judgement about
 * how long to be generous rather than an arithmetic fact.
 */
export const GRACE_DAYS = 14
const GRACE_MS = GRACE_DAYS * 86_400_000

export interface Entitlement {
  /** The server's date, as it sent it. Null when the account has never paid. */
  proUntil: string | null
  /** When this device last got an answer. ISO, this device's clock. */
  checkedAt: string
  /**
   * Whether this account administers the platform.
   *
   * Cached alongside the date and honoured ahead of it, because whoever runs
   * this thing has to be able to open every screen in it. Not a date, and not
   * written into `pro_until`: stamping a far-future date on an admin would be a
   * lie in the field the billing webhook owns, and it would outlive them being
   * one. The server decides; this is where the answer is kept.
   */
  admin?: boolean
}

/**
 * `unknown` is not the same as `lapsed` and the copy says so.
 *
 * A member who paid and is offline on a new device is told we could not check,
 * not told they have not paid. Getting that sentence wrong is the kind of
 * accusation people remember.
 */
export type ProReason = 'active' | 'grace' | 'lapsed' | 'unknown' | 'admin'

export interface ProState {
  pro: boolean
  reason: ProReason
  /** The date behind the verdict, for the screen that shows it. */
  until: string | null
}

/** PocketBase writes `2026-10-03 00:00:00.000Z`; the space is not ISO. */
function instant(text: string | null): number {
  if (!text) return NaN
  let normalised = text.trim().replace(' ', 'T')
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(normalised)) normalised += 'Z'
  return Date.parse(normalised)
}

/**
 * The verdict, from a cached answer and a clock. Pure, so it can be tested.
 *
 * Order matters. The date being ahead is the ordinary case and needs no grace:
 * a monthly subscription is renewed with weeks left on it, so a device that
 * syncs at all is never near the edge.
 */
export function decide(cache: Entitlement | null, nowMs: number): ProState {
  if (!cache) return { pro: false, reason: 'unknown', until: null }

  /* Before the date, and regardless of it. An admin with a lapsed subscription
     is still an admin, and an admin who has never paid is the ordinary case. */
  if (cache.admin) return { pro: true, reason: 'admin', until: null }

  const until = instant(cache.proUntil)
  if (!Number.isFinite(until)) {
    /* We asked, and the account has never paid. That is an answer, not a gap. */
    return { pro: false, reason: 'lapsed', until: null }
  }
  if (until > nowMs) return { pro: true, reason: 'active', until: cache.proUntil }

  /**
   * The date has passed. Two very different reasons it could have.
   *
   * If it was still ahead when we last got an answer, the subscription was live
   * the last time anybody told us anything, and we have since been unable to
   * ask. A renewal almost certainly happened. Keep them in, bounded.
   *
   * If it had already passed when we last asked, the server told us it was
   * over. There is nothing to be generous about.
   */
  const checked = instant(cache.checkedAt)
  const wasLiveWhenAsked = Number.isFinite(checked) && until > checked
  if (wasLiveWhenAsked && nowMs - until <= GRACE_MS) {
    return { pro: true, reason: 'grace', until: cache.proUntil }
  }
  return { pro: false, reason: 'lapsed', until: cache.proUntil }
}

export function readEntitlement(profileId: string): Entitlement | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + profileId)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Entitlement>
    if (typeof parsed.checkedAt !== 'string') return null
    return {
      proUntil: typeof parsed.proUntil === 'string' ? parsed.proUntil : null,
      checkedAt: parsed.checkedAt,
      admin: parsed.admin === true,
    }
  } catch {
    return null
  }
}

/** Forgets what this device believed. Called when a profile drops its account. */
export function clearEntitlement(profileId: string): void {
  try {
    localStorage.removeItem(KEY_PREFIX + profileId)
  } catch {
    /* Private mode: there was nothing to forget. */
  }
}

export function proStateOf(profileId: string, nowMs = Date.now()): ProState {
  return decide(readEntitlement(profileId), nowMs)
}

/**
 * Tells the session store, so the screens that gate on it re-render.
 *
 * One place writes it, for the reason `viewerFor` exists in `profiles.ts`: two
 * callers each remembering to push the same fact is how they come to disagree.
 * Guarded on the profile still being the active one, the same way
 * `setActiveGymName` is, because a probe started before a lock can land after
 * it and must not hand the next profile somebody else's subscription.
 */
function publish(profileId: string, state: ProState): ProState {
  if (useSession.getState().profileId === profileId) {
    useSession.getState().refreshMeta({ pro: state.pro })
  }
  return state
}

/**
 * What this device already believed, applied before anybody is asked.
 *
 * Called on unlock so a paying member's screens are there on the first frame
 * rather than after a round trip. Without it every unlock would draw the
 * unpaid layout and then replace it, which on a slow connection is a paid
 * feature blinking out of existence in front of the person paying for it.
 */
export function adoptEntitlement(profileId: string): ProState {
  return publish(profileId, proStateOf(profileId))
}

/**
 * Asks the server what this account is entitled to.
 *
 * Quiet on every failure, and deliberately so: an unreachable server must leave
 * the cached answer standing, because the cached answer plus the grace window
 * is the whole offline story. Writing "not paid" here on a timeout would take
 * the planner away from somebody on a train.
 *
 * A profile with no sync link has no account and therefore no subscription;
 * that is a definite `null`, not a failure, so the cache is cleared rather than
 * left holding a stale yes from a link that has since been removed.
 */
export async function refreshEntitlement(profileId: string): Promise<ProState> {
  const link = readSyncLink(profileId)
  const auth = activeAuthHeader()
  if (!link || !auth) {
    clearEntitlement(profileId)
    return publish(profileId, { pro: false, reason: 'unknown', until: null })
  }
  try {
    const base = link.server.trim().replace(/\/+$/, '') || '/pb'
    const res = await fetch(`${base}/api/enforma/me`, {
      headers: auth,
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return publish(profileId, proStateOf(profileId))
    const parsed = (await res.json()) as { proUntil?: unknown; admin?: unknown }
    const cache: Entitlement = {
      proUntil: typeof parsed.proUntil === 'string' ? parsed.proUntil : null,
      checkedAt: new Date().toISOString(),
      admin: parsed.admin === true,
    }
    try {
      localStorage.setItem(KEY_PREFIX + profileId, JSON.stringify(cache))
    } catch {
      /* Private mode: this session still has the answer below. */
    }
    return publish(profileId, decide(cache, Date.now()))
  } catch {
    return publish(profileId, proStateOf(profileId))
  }
}
