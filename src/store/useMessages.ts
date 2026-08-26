import { create } from 'zustand'
import type { GymMessage, TemplateKind, MenuCourse } from '../lib/messages'

/**
 * The device message bus. Plaintext by design (see docs/PANELS.md): gym
 * broadcasts are directory-level data. Persisted on every change and
 * re-hydrated on the `storage` event, so a gym tab and a member tab on the
 * same machine stay in sync live.
 */

const STORE_KEY = 'forma-gym-messages'

function load(): GymMessage[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as GymMessage[]) : []
  } catch {
    return []
  }
}

function persist(messages: GymMessage[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(messages))
}

export interface PublishInput {
  gym: string
  authorId: string
  kind: TemplateKind
  title: string
  body?: string
  audience: 'all' | string[]
  event?: { date: string; time?: string; place?: string }
  menu?: { courses: MenuCourse[] }
  offer?: { discount: string; validUntil?: string; code: string }
}

interface MessagesState {
  messages: GymMessage[]
  publish: (input: PublishInput) => GymMessage
  remove: (id: string) => void
  removeByGym: (gym: string) => void
  renameGym: (from: string, to: string) => void
  markRead: (ids: string[], profileId: string) => void
  respond: (id: string, profileId: string, answer: 'yes' | 'no') => void
  toggleSaved: (id: string, profileId: string) => void
  rehydrate: () => void
}

export const useMessages = create<MessagesState>()((set, get) => ({
  messages: typeof localStorage === 'undefined' ? [] : load(),

  publish: (input) => {
    const message: GymMessage = {
      ...input,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      readBy: [],
      rsvp: {},
      saved: [],
    }
    const messages = [message, ...get().messages]
    persist(messages)
    set({ messages })
    return message
  },

  remove: (id) => {
    const messages = get().messages.filter((m) => m.id !== id)
    persist(messages)
    set({ messages })
  },

  removeByGym: (gym) => {
    const key = gym.trim().toLowerCase()
    const messages = get().messages.filter((m) => m.gym.trim().toLowerCase() !== key)
    persist(messages)
    set({ messages })
  },

  renameGym: (from, to) => {
    const key = from.trim().toLowerCase()
    const target = to.trim()
    if (!target) return
    const messages = get().messages.map((m) =>
      m.gym.trim().toLowerCase() === key ? { ...m, gym: target } : m,
    )
    persist(messages)
    set({ messages })
  },

  markRead: (ids, profileId) => {
    let changed = false
    const messages = get().messages.map((m) => {
      if (!ids.includes(m.id) || m.readBy.includes(profileId)) return m
      changed = true
      return { ...m, readBy: [...m.readBy, profileId] }
    })
    if (!changed) return
    persist(messages)
    set({ messages })
  },

  respond: (id, profileId, answer) => {
    const messages = get().messages.map((m) =>
      m.id === id ? { ...m, rsvp: { ...m.rsvp, [profileId]: answer } } : m,
    )
    persist(messages)
    set({ messages })
  },

  toggleSaved: (id, profileId) => {
    const messages = get().messages.map((m) => {
      if (m.id !== id) return m
      const saved = m.saved.includes(profileId)
        ? m.saved.filter((p) => p !== profileId)
        : [...m.saved, profileId]
      return { ...m, saved }
    })
    persist(messages)
    set({ messages })
  },

  rehydrate: () => set({ messages: load() }),
}))

/** Cross-tab sync: another tab wrote the store; pick it up. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) useMessages.getState().rehydrate()
  })
}
