import { readSyncLink } from './sync'
import { refreshCapabilities, serverCapabilities } from './capabilities'

/**
 * Notifications, in two layers. Local ones fire while enForma is open — the
 * original local-first behaviour, no server involved. Since phase 6, linked
 * profiles can also subscribe this device to real Web Push: the sync server's
 * sender delivers gym messages while the app is closed, and src/sw.ts shows
 * them. See docs/PANELS.md.
 */

/**
 * Two independent preferences, because they answer to different appetites:
 * a member who wants gym news does not necessarily want training nudges.
 */
const PREF_KEY = 'forma-notify'
const TRAINING_PREF_KEY = 'forma-notify-training'

export type NotifyChannel = 'gym' | 'training'

const keyFor = (channel: NotifyChannel) => (channel === 'gym' ? PREF_KEY : TRAINING_PREF_KEY)

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

/**
 * Effective state: a channel delivers only when the browser has granted
 * permission AND the preference is not switched off. The preference is
 * opt-out — absent means on — so once permission is granted both channels
 * work without a second trip to Settings.
 */
export function notificationsEnabled(channel: NotifyChannel = 'gym'): boolean {
  return (
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    localStorage.getItem(keyFor(channel)) !== 'off'
  )
}

/** The opt-out preference alone (on unless turned off), ignoring permission. */
export function notificationsWanted(channel: NotifyChannel = 'gym'): boolean {
  return notificationsSupported() && localStorage.getItem(keyFor(channel)) !== 'off'
}

/** Records the preference without touching browser permission. */
export function setNotificationPref(channel: NotifyChannel, on: boolean): void {
  localStorage.setItem(keyFor(channel), on ? 'on' : 'off')
}

/** Whether the browser has decided on permission: 'default' | 'granted' | 'denied'. */
export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied'
}

/** Asks the browser for permission from a user gesture; true once granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false
  if (Notification.permission === 'granted') return true
  return (await Notification.requestPermission()) === 'granted'
}

/** Turns the preference on, asking the browser if needed. */
export async function enableNotifications(channel: NotifyChannel = 'gym'): Promise<boolean> {
  if (!notificationsSupported()) return false
  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') return false
  localStorage.setItem(keyFor(channel), 'on')
  return true
}

export function disableNotifications(channel: NotifyChannel = 'gym'): void {
  localStorage.setItem(keyFor(channel), 'off')
}

/** Shows via the service worker when available (survives tab focus loss). */
export async function showNotification(
  title: string,
  body: string,
  channel: NotifyChannel = 'gym',
): Promise<void> {
  if (!notificationsEnabled(channel)) return
  try {
    const registration = await navigator.serviceWorker?.getRegistration()
    if (registration) {
      await registration.showNotification(title, { body, icon: '/apple-touch-icon.png' })
      return
    }
  } catch {
    // Fall through to the bare API.
  }
  try {
    new Notification(title, { body, icon: '/apple-touch-icon.png' })
  } catch {
    // Some platforms only allow worker notifications; nothing more to do.
  }
}

/** One notification summarising unread gym messages, if any. */
export async function notifyUnread(count: number, gym: string): Promise<void> {
  if (count <= 0) return
  await showNotification(
    gym,
    count === 1 ? 'You have a new message from your gym.' : `You have ${count} new messages from your gym.`,
  )
}

/**
 * The retest nudge, fired once per stale test. The marker is keyed by the
 * test's own date and persisted: an in-memory guard would re-fire on every
 * reload, and a plain boolean would never re-arm after a retest.
 */
const RETEST_MARKER = 'forma-retest-nudged'

export function retestNudgeAlreadySent(takenAt: string): boolean {
  return localStorage.getItem(RETEST_MARKER) === takenAt
}

export async function notifyRetestDue(takenAt: string, weeks: number): Promise<void> {
  if (retestNudgeAlreadySent(takenAt)) return
  localStorage.setItem(RETEST_MARKER, takenAt)
  await showNotification(
    'Time to retest',
    `Your fitness test is ${weeks} weeks old. Five minutes will tell you what changed.`,
    'training',
  )
}

/* ------------------------------------------------------------------------ */
/* Web Push (phase 6): gym messages reach this device while the app is       */
/* closed. Push travels through the sync account — the subscription is a row */
/* the server's sender reads — so it exists only for linked profiles.        */

const PUSH_PREF_PREFIX = 'forma-push-'

export function pushSupported(): boolean {
  return (
    notificationsSupported() &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window
  )
}

/** iOS only delivers Web Push to apps installed on the Home Screen. */
export function needsHomeScreenForPush(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return isIos && !standalone
}

export function pushEnabled(profileId: string): boolean {
  return localStorage.getItem(PUSH_PREF_PREFIX + profileId) === 'on'
}

function applicationServerKey(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

export type PushResult = { ok: true } | { ok: false; message: string }

export async function enablePush(profileId: string): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, message: 'This browser cannot receive push.' }
  const link = readSyncLink(profileId)
  if (!link?.token) {
    return { ok: false, message: 'Push travels through your sync account — turn on sync first.' }
  }
  await refreshCapabilities(link.server)
  const vapid = serverCapabilities().push
  if (!vapid) return { ok: false, message: 'The sync server has no push delivery configured.' }
  if (!(await enableNotifications('gym'))) {
    return { ok: false, message: 'Notification permission was not granted.' }
  }
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration) {
    return { ok: false, message: 'No service worker here — push works in the installed build.' }
  }
  let subscription: PushSubscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(vapid) as BufferSource,
    })
  } catch {
    return { ok: false, message: 'The browser refused the push subscription.' }
  }
  const keys = subscription.toJSON().keys ?? {}
  const res = await fetch(`${link.server}/api/collections/push_subs/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: link.token },
    body: JSON.stringify({
      owner: link.userId,
      endpoint: subscription.endpoint,
      p256dh: keys.p256dh ?? '',
      auth: keys.auth ?? '',
    }),
  })
  /* 400 here is the unique endpoint index: this device is already registered. */
  if (!res.ok && res.status !== 400) {
    return { ok: false, message: 'Registering the subscription on the server failed.' }
  }
  localStorage.setItem(PUSH_PREF_PREFIX + profileId, 'on')
  return { ok: true }
}

export async function disablePush(profileId: string): Promise<void> {
  localStorage.setItem(PUSH_PREF_PREFIX + profileId, 'off')
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    const link = readSyncLink(profileId)
    if (link?.token) {
      const filter = encodeURIComponent(`endpoint = "${subscription.endpoint}"`)
      const list = (await fetch(
        `${link.server}/api/collections/push_subs/records?perPage=1&filter=${filter}`,
        { headers: { authorization: link.token } },
      )
        .then((r) => r.json())
        .catch(() => null)) as { items?: { id: string }[] } | null
      const id = list?.items?.[0]?.id
      if (id) {
        await fetch(`${link.server}/api/collections/push_subs/records/${id}`, {
          method: 'DELETE',
          headers: { authorization: link.token },
        }).catch(() => {})
      }
    }
    await subscription.unsubscribe()
  } catch {
    /* The pref is off; a dead subscription gets dropped by the sender's 410. */
  }
}
