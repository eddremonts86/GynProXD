/**
 * Standing gym menus. Unlike the "Daily menu" message (a one-off broadcast),
 * this is the gym's permanent kitchen card: device-level, one per gym,
 * edited from the gym panel and browsed by members at /menu.
 */

export interface MenuItem {
  name: string
  desc?: string
  /** As typed by the gym, currency included — see the note in messages.ts. */
  price?: string
}

export interface MenuSection {
  name: string
  items: MenuItem[]
}

export interface GymMenu {
  gym: string
  updatedAt: string
  sections: MenuSection[]
}

/**
 * What actually counts as a card: named sections holding named items, trimmed.
 * Shared so the copy saved on the device and the copy sent to the gym's
 * members are the same bytes rather than two hopeful approximations.
 */
export function cleanSections(sections: MenuSection[]): MenuSection[] {
  return sections
    .map((s) => ({
      name: s.name.trim(),
      items: s.items
        .map((i) => ({
          name: i.name.trim(),
          desc: i.desc?.trim() || undefined,
          price: i.price?.trim() || undefined,
        }))
        .filter((i) => i.name),
    }))
    .filter((s) => s.name && s.items.length > 0)
}

export function menuFor(menus: GymMenu[], gym: string | undefined): GymMenu | null {
  if (!gym) return null
  const key = gym.trim().toLowerCase()
  return menus.find((m) => m.gym.trim().toLowerCase() === key) ?? null
}

export function countItems(menu: GymMenu): number {
  return menu.sections.reduce((sum, s) => sum + s.items.length, 0)
}
