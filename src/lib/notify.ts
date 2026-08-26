/**
 * System notifications for gym messages. Local-first honesty: these fire
 * while enForma is open (or resuming), because true remote push needs a
 * server (VAPID + subscription store). If that backend ever lands, its
 * `push` listener plugs into the same service worker and this module keeps
 * the display side. See docs/PANELS.md.
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

export function notificationsEnabled(channel: NotifyChannel = 'gym'): boolean {
  return (
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    localStorage.getItem(keyFor(channel)) === 'on'
  )
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
