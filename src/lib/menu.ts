/**
 * Standing gym menus. Unlike the "Daily menu" message (a one-off broadcast),
 * this is the gym's permanent kitchen card: device-level, one per gym,
 * edited from the gym panel and browsed by members at /menu.
 */

export interface MenuItem {
  name: string
  desc?: string
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

export function menuFor(menus: GymMenu[], gym: string | undefined): GymMenu | null {
  if (!gym) return null
  const key = gym.trim().toLowerCase()
  return menus.find((m) => m.gym.trim().toLowerCase() === key) ?? null
}

export function countItems(menu: GymMenu): number {
  return menu.sections.reduce((sum, s) => sum + s.items.length, 0)
}
