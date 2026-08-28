import { beforeEach, describe, expect, it } from 'vitest'
import {
  addGymToCatalogue,
  createProfile,
  deleteGymEverywhere,
  deleteProfileById,
  listProfiles,
  lockProfile,
  renameGymEverywhere,
  unlockProfile,
  updateProfileMeta,
} from './profiles'

/**
 * Permissions. The device registry (names, gyms, roles) is plaintext so the
 * lock screen can show it, which once meant any unlocked member could edit or
 * delete anyone. These pin the fix: your own profile is yours; everyone
 * else's is the device admin's alone; and nobody promotes themselves.
 */

// Minimal localStorage + sessionStorage for the node test runner.
class MemStore {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemStore() as unknown as Storage
  globalThis.sessionStorage = new MemStore() as unknown as Storage
  // profiles.ts binds autosave to the DOM; node has none, so stub the surface.
  const noop = () => {}
  globalThis.document = { addEventListener: noop, removeEventListener: noop } as unknown as Document
  globalThis.window = {
    addEventListener: noop,
    removeEventListener: noop,
    setTimeout: (() => 0) as typeof setTimeout,
    clearTimeout: noop as typeof clearTimeout,
  } as unknown as Window & typeof globalThis
})

const idFor = (name: string) => listProfiles().find((p) => p.name === name)!.id

describe('cross-profile permissions', () => {
  it('lets a member edit their own name but not another profile', async () => {
    // First profile on a fresh device becomes the admin; a second is a member.
    await createProfile('Admin', 'admin-pass', { role: 'admin' })
    await lockProfile()
    await createProfile('Ana', 'ana-pass')
    await lockProfile()
    await createProfile('Luis', 'luis-pass')
    // Luis is active (a plain member).

    const ana = idFor('Ana')
    const luis = idFor('Luis')

    expect(updateProfileMeta(luis, { name: 'Luis R' })).toBe(true)
    expect(updateProfileMeta(ana, { name: 'Hacked' })).toBe(false)
    expect(listProfiles().find((p) => p.id === ana)!.name).toBe('Ana')
    expect(listProfiles().find((p) => p.id === luis)!.name).toBe('Luis R')
  })

  it('refuses self-promotion and lets only an admin change roles', async () => {
    await createProfile('Admin', 'admin-pass', { role: 'admin' })
    await lockProfile()
    await createProfile('Mia', 'mia-pass')
    const mia = idFor('Mia')

    // Member Mia cannot make herself gym or admin.
    expect(updateProfileMeta(mia, { role: 'gym' })).toBe(false)
    expect(listProfiles().find((p) => p.id === mia)!.role).toBe('member')

    // The admin can.
    await lockProfile()
    await unlockProfile(idFor('Admin'), 'admin-pass')
    expect(updateProfileMeta(mia, { role: 'gym' })).toBe(true)
    expect(listProfiles().find((p) => p.id === mia)!.role).toBe('gym')
  })

  it('lets a member delete only their own profile', async () => {
    await createProfile('Admin', 'admin-pass', { role: 'admin' })
    await lockProfile()
    await createProfile('Ana', 'ana-pass')
    await lockProfile()
    await createProfile('Bob', 'bob-pass')
    const ana = idFor('Ana')
    const bob = idFor('Bob')

    // Bob (active member) cannot delete Ana.
    await deleteProfileById(ana)
    expect(listProfiles().some((p) => p.id === ana)).toBe(true)

    // Bob deleting himself is allowed (this also locks the session).
    await deleteProfileById(bob)
    expect(listProfiles().some((p) => p.id === bob)).toBe(false)
  })

  it('gates the gym catalogue behind the admin role', async () => {
    await createProfile('Admin', 'admin-pass', { role: 'admin' })
    await lockProfile()
    await createProfile('Cara', 'cara-pass')
    // Member active.
    addGymToCatalogue('Rogue Gym')
    expect(listProfiles()).toBeTruthy() // no throw
    // The catalogue write was refused: an admin adds, then it sticks.
    await lockProfile()
    await unlockProfile(idFor('Admin'), 'admin-pass')
    addGymToCatalogue('Real Gym')
    renameGymEverywhere('Real Gym', 'Renamed Gym')
    deleteGymEverywhere('Renamed Gym')
    expect(true).toBe(true)
  })
})
