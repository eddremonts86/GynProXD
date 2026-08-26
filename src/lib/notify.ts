/**
 * System notifications for gym messages. Local-first honesty: these fire
 * while enForma is open (or resuming), because true remote push needs a
 * server (VAPID + subscription store). If that backend ever lands, its
 * `push` listener plugs into the same service worker and this module keeps
 * the display side. See docs/PANELS.md.
 */

const PREF_KEY = 'forma-notify'

export function notificationsSupported(): boolean {
  return typeof Notification !== 'undefined'
}

export function notificationsEnabled(): boolean {
  return (
    notificationsSupported() &&
    Notification.permission === 'granted' &&
    localStorage.getItem(PREF_KEY) === 'on'
  )
}

/** Turns the preference on, asking the browser if needed. */
export async function enableNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false
  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()
  if (permission !== 'granted') return false
  localStorage.setItem(PREF_KEY, 'on')
  return true
}

export function disableNotifications(): void {
  localStorage.setItem(PREF_KEY, 'off')
}

/** Shows via the service worker when available (survives tab focus loss). */
export async function showNotification(title: string, body: string): Promise<void> {
  if (!notificationsEnabled()) return
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
