/**
 * Gym-to-member messaging. Messages live in a device-level plaintext store:
 * events, menus and offers are broadcast material, not member secrets, so
 * they sit at the same trust level as the profile directory. Training data
 * stays encrypted per profile and is never touched by any of this.
 */

export type TemplateKind = 'announcement' | 'event' | 'menu' | 'offer'

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
  readBy: string[]
  rsvp: Record<string, 'yes' | 'no'>
  saved: string[]
}

export const TEMPLATE_LABELS: Record<TemplateKind, string> = {
  announcement: 'Announcement',
  event: 'Event',
  menu: 'Daily menu',
  offer: 'Offer',
}

const sameGym = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

export function isAddressedTo(
  message: GymMessage,
  profile: { id: string; gym?: string },
): boolean {
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
