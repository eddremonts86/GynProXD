import { create } from 'zustand'
import type {
  GymMessage,
  MenuCourse,
  MessageImage,
  MessageScope,
  TemplateKind,
} from '../lib/messages'
import { applyResponses, markResponseDirty, type ResponseRow } from '../lib/gym-responses'
import type { Challenge } from '../lib/challenge'
import type { Collection } from '../lib/collection'

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
  /** Only the house sets this; a gym's messages carry none. See MessageScope. */
  scope?: MessageScope
  event?: { date: string; time?: string; place?: string }
  menu?: { courses: MenuCourse[] }
  offer?: { discount: string; validUntil?: string; code: string }
  product?: { name: string; price: string; note?: string }
  challenge?: Challenge
  collection?: Collection
  banner?: { minutes: number }
  link?: 'menu'
  /** Already uploaded; the picker holds the files until the server names them. */
  images?: MessageImage[]
}

interface MessagesState {
  messages: GymMessage[]
  /** `id` comes from the server bus when a publish also went out to it. */
  publish: (input: PublishInput & { id?: string }) => GymMessage
  /** Upserts rows pulled from the server bus, keeping local read/RSVP state. */
  merge: (incoming: GymMessage[]) => number
  /** Folds the gym's members' answers, pulled from the server, into the bus. */
  applyRemoteResponses: (
    rows: ResponseRow[],
    selfUserId: string,
    selfProfileId: string,
    keepMine?: Set<string>,
  ) => void
  remove: (id: string) => void
  removeByGym: (gym: string) => void
  renameGym: (from: string, to: string) => void
  markRead: (ids: string[], profileId: string) => void
  /**
   * Removes a message from one profile's inbox, or puts it back.
   *
   * Deliberately not `remove`, which deletes the row for everybody on this
   * device and is the gym's own action from its sent list. A member clearing
   * their inbox must not erase an event other profiles are still reading.
   */
  setRemoved: (id: string, profileId: string, removed: boolean) => void
  /**
   * Puts a message back in the unread state for one profile.
   *
   * Deliberately does not mark the response dirty. The gym was already told it
   * was opened and that remains true — this is somebody saying "I have not
   * dealt with this yet", not a retraction of what happened. Claiming to
   * un-tell the gym would be a promise this cannot keep.
   */
  setUnread: (id: string, profileId: string) => void
  respond: (id: string, profileId: string, answer: 'yes' | 'no') => void
  dismissBanner: (id: string, profileId: string) => void
  toggleSaved: (id: string, profileId: string) => void
  toggleJoined: (id: string, profileId: string) => void
  rehydrate: () => void
}

export const useMessages = create<MessagesState>()((set, get) => ({
  messages: typeof localStorage === 'undefined' ? [] : load(),

  publish: (input) => {
    const message: GymMessage = {
      ...input,
      id: input.id ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  merge: (incoming) => {
    if (incoming.length === 0) return 0
    const current = get().messages
    const byId = new Map(current.map((m) => [m.id, m]))
    let added = 0
    for (const message of incoming) {
      const existing = byId.get(message.id)
      if (existing) {
        /* Content may have been edited upstream; what this device knows about
           its own people (reads, answers, saves) is not the server's to reset. */
        byId.set(message.id, {
          ...message,
          readBy: existing.readBy,
          rsvp: existing.rsvp,
          saved: existing.saved,
          joined: existing.joined,
          respondents: existing.respondents,
          bannerDismissedBy: existing.bannerDismissedBy,
          /* Without this line the next pull hands back a row with no
             `deletedBy` and everything a member cleared reappears. The server
             is not told what somebody removed from their own inbox, so it
             cannot be the one to remember it. */
          deletedBy: existing.deletedBy,
        })
      } else {
        byId.set(message.id, message)
        added += 1
      }
    }
    const messages = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    persist(messages)
    set({ messages })
    return added
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
    markResponseDirty(profileId, ids)
    persist(messages)
    set({ messages })
  },

  setUnread: (id, profileId) => {
    const messages = get().messages.map((m) =>
      m.id === id ? { ...m, readBy: m.readBy.filter((p) => p !== profileId) } : m,
    )
    persist(messages)
    set({ messages })
  },

  setRemoved: (id, profileId, removed) => {
    const messages = get().messages.map((m) => {
      if (m.id !== id) return m
      const list = m.deletedBy ?? []
      if (removed === list.includes(profileId)) return m
      return {
        ...m,
        deletedBy: removed ? [...list, profileId] : list.filter((p) => p !== profileId),
      }
    })
    persist(messages)
    set({ messages })
  },

  dismissBanner: (id, profileId) => {
    const messages = get().messages.map((m) =>
      m.id === id && !m.bannerDismissedBy?.includes(profileId)
        ? { ...m, bannerDismissedBy: [...(m.bannerDismissedBy ?? []), profileId] }
        : m,
    )
    persist(messages)
    set({ messages })
  },

  respond: (id, profileId, answer) => {
    const messages = get().messages.map((m) =>
      m.id === id ? { ...m, rsvp: { ...m.rsvp, [profileId]: answer } } : m,
    )
    markResponseDirty(profileId, [id])
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
    markResponseDirty(profileId, [id])
    persist(messages)
    set({ messages })
  },

  toggleJoined: (id, profileId) => {
    const messages = get().messages.map((m) => {
      if (m.id !== id) return m
      const joined = (m.joined ?? []).includes(profileId)
        ? (m.joined ?? []).filter((p) => p !== profileId)
        : [...(m.joined ?? []), profileId]
      return { ...m, joined }
    })
    markResponseDirty(profileId, [id])
    persist(messages)
    set({ messages })
  },

  applyRemoteResponses: (rows, selfUserId, selfProfileId, keepMine) => {
    const messages = applyResponses(get().messages, rows, selfUserId, selfProfileId, keepMine)
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
