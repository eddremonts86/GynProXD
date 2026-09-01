import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  notificationsEnabled,
  notificationsMuted,
  notificationsWanted,
  setNotificationPref,
  setNotificationsMuted,
} from './notify'

/**
 * The switch that exists because the browser's own does not answer to us.
 *
 * Both browser globals are stubbed rather than borrowed from an environment.
 * jsdom would give neither: it has no Notification at all, and Node 26 shadows
 * `localStorage` with a global of its own that is undefined unless the process
 * was started with `--localstorage-file`. Stubbing is also the truer test —
 * what is being checked is this app's gate, and the entire point of that gate
 * is that it is separate from whatever the browser has decided.
 */
function stubStorage() {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  })
}

function stubPermission(permission: NotificationPermission) {
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    writable: true,
    value: { permission },
  })
}

beforeEach(() => {
  stubStorage()
  stubPermission('granted')
})

afterEach(() => {
  stubStorage()
})

describe('the device-wide mute', () => {
  it('is off until somebody turns it on, so nothing goes quiet on upgrade', () => {
    expect(notificationsMuted()).toBe(false)
    expect(notificationsEnabled('gym')).toBe(true)
    expect(notificationsEnabled('training')).toBe(true)
  })

  it('silences every channel at once', () => {
    setNotificationsMuted(true)
    expect(notificationsMuted()).toBe(true)
    expect(notificationsEnabled('gym')).toBe(false)
    expect(notificationsEnabled('training')).toBe(false)
  })

  it('leaves the per-channel preferences alone while it is on', () => {
    // The rows stay on screen while silenced, so what somebody chose has to
    // survive being muted and come back when they unmute.
    setNotificationPref('training', false)
    setNotificationsMuted(true)
    expect(notificationsWanted('gym')).toBe(true)
    expect(notificationsWanted('training')).toBe(false)

    setNotificationsMuted(false)
    expect(notificationsEnabled('gym')).toBe(true)
    expect(notificationsEnabled('training')).toBe(false)
  })

  it('is a separate fact from the browser permission', () => {
    // Unmuted and still blocked: this is the state the old screen had no
    // control for at all. The preference is real; delivery is not, yet.
    stubPermission('denied')
    expect(notificationsMuted()).toBe(false)
    expect(notificationsWanted('gym')).toBe(true)
    expect(notificationsEnabled('gym')).toBe(false)
  })

  it('does not deliver on a granted permission it was muted under', () => {
    setNotificationsMuted(true)
    stubPermission('granted')
    expect(notificationsEnabled('gym')).toBe(false)
  })
})
