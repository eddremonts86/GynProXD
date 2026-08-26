import { create } from 'zustand'
import type { GymMenu, MenuSection } from '../lib/menu'

/** Device store for standing gym menus; same trust level as the message bus. */

const STORE_KEY = 'forma-gym-menus'

function load(): GymMenu[] {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as GymMenu[]) : []
  } catch {
    return []
  }
}

function persist(menus: GymMenu[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(menus))
}

interface MenusState {
  menus: GymMenu[]
  setMenu: (gym: string, sections: MenuSection[]) => void
  removeMenu: (gym: string) => void
  renameGym: (from: string, to: string) => void
  rehydrate: () => void
}

const keyOf = (gym: string) => gym.trim().toLowerCase()

export const useMenus = create<MenusState>()((set, get) => ({
  menus: typeof localStorage === 'undefined' ? [] : load(),

  setMenu: (gym, sections) => {
    const cleaned = sections
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
    const entry: GymMenu = { gym: gym.trim(), updatedAt: new Date().toISOString(), sections: cleaned }
    const menus = [...get().menus.filter((m) => keyOf(m.gym) !== keyOf(gym)), entry]
    persist(menus)
    set({ menus })
  },

  removeMenu: (gym) => {
    const menus = get().menus.filter((m) => keyOf(m.gym) !== keyOf(gym))
    persist(menus)
    set({ menus })
  },

  renameGym: (from, to) => {
    const target = to.trim()
    if (!target) return
    const menus = get().menus.map((m) => (keyOf(m.gym) === keyOf(from) ? { ...m, gym: target } : m))
    persist(menus)
    set({ menus })
  },

  rehydrate: () => set({ menus: load() }),
}))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY) useMenus.getState().rehydrate()
  })
}
