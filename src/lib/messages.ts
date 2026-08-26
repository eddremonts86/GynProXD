/**
 * Gym-to-member messaging. Messages live in a device-level plaintext store:
 * events, menus and offers are broadcast material, not member secrets, so
 * they sit at the same trust level as the profile directory. Training data
 * stays encrypted per profile and is never touched by any of this.
 */

import type { Challenge } from './challenge'
import type { Collection } from './collection'

export type TemplateKind =
  | 'announcement'
  | 'event'
  | 'menu'
  | 'offer'
  | 'challenge'
  | 'collection'

export interface MenuCourse {
  name: string
  dishes: string[]
}

export interface GymMessage {
  id: string
  /** Gym name as written in the directory; matched case-insensitively. */
  gym: string
  authorId: string
  createdAt: string
  kind: TemplateKind
  title: string
  body?: string
  /** 'all' reaches every member of the gym; otherwise explicit profile ids. */
  audience: 'all' | string[]
  event?: { date: string; time?: string; place?: string }
  menu?: { courses: MenuCourse[] }
  offer?: { discount: string; validUntil?: string; code: string }
  challenge?: Challenge
  collection?: Collection
  /** Also surface as a strip under the top bar, for this many minutes. */
  banner?: { minutes: number }
  /** Where the banner's View action goes; default is the inbox. */
  link?: 'menu'
  readBy: string[]
  rsvp: Record<string, 'yes' | 'no'>
  saved: string[]
  /** Members who joined a challenge; the definition copy in their profile is theirs. */
  joined?: string[]
  bannerDismissedBy?: string[]
}

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  announcement: 'Announcement',
  event: 'Event',
  menu: 'Daily menu',
  offer: 'Offer',
  challenge: 'Challenge',
  collection: 'Collection',
}

const sameGym = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export function isAddressedTo(
  message: GymMessage,
  profile: { id: string; gym?: string },
): boolean {
  /* Authors never receive their own broadcasts; their view is the sent list. */
  if (message.authorId === profile.id) return false
  if (!sameGym(message.gym, profile.gym)) return false
  return message.audience === 'all' || message.audience.includes(profile.id)
}

export function inboxFor(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
): GymMessage[] {
  return messages
    .filter((m) => isAddressedTo(m, profile))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function unreadCount(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
): number {
  return messages.filter((m) => isAddressedTo(m, profile) && !m.readBy.includes(profile.id))
    .length
}

/** Banners still inside their window, addressed to and not dismissed by the viewer. */
export function activeBanners(
  messages: GymMessage[],
  profile: { id: string; gym?: string },
  now: number = Date.now(),
): GymMessage[] {
  return messages
    .filter((m) => {
      if (!m.banner || !isAddressedTo(m, profile)) return false
      if (m.bannerDismissedBy?.includes(profile.id)) return false
      const expires = new Date(m.createdAt).getTime() + m.banner.minutes * 60_000
      return expires > now
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export const BANNER_DURATIONS = [
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 1440, label: 'All day' },
] as const

export function sentBy(messages: GymMessage[], gym: string): GymMessage[] {
  return messages
    .filter((m) => sameGym(m.gym, gym))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Short, unambiguous redemption code: no 0/O or 1/I lookalikes. */
export function makeOfferCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(random() * alphabet.length)]
    if (i === 3) code += '-'
  }
  return code
}

/** What the offer QR encodes: scannable, human-checkable at the desk. */
export function offerPayload(code: string, gym: string): string {
  return `enforma:offer:${code}:${gym}`
}
