import { create } from 'zustand'
import type { ProfileRole } from '../lib/profiles'

/** Whether a profile is unlocked. The key itself lives in lib/profiles. */
interface SessionState {
  status: 'boot' | 'locked' | 'unlocked'
  profileId: string | null
  profileName: string | null
  gym: string | null
  role: ProfileRole
  /**
   * Whether this account is on Pro, as `lib/entitlement` last decided.
   *
   * Here rather than read from localStorage at each call site because screens
   * have to re-render when it changes, which is the same reason `role` is here.
   * False until the probe answers: a paid screen appearing a moment late is a
   * flicker, and one appearing for an account that never paid is revenue.
   */
  pro: boolean
  /**
   * Whether this profile has a sync account on this device.
   *
   * Here rather than read from localStorage at each call site because two
   * panels on one screen depend on it and only one of them was being told when
   * it changed: creating an account left the subscription panel below still
   * saying to go and create one, until somebody navigated away. `readSyncLink`
   * is still the source; this is the signal that it moved.
   */
  linked: boolean
  setUnlocked: (meta: { id: string; name: string; gym?: string; role: ProfileRole }) => void
  /** Refreshes name/gym/role/pro after a Settings edit or a server answer. */
  refreshMeta: (meta: {
    name?: string
    gym?: string
    role?: ProfileRole
    pro?: boolean
    linked?: boolean
  }) => void
  setLocked: () => void
}

export const useSession = create<SessionState>()((set) => ({
  status: 'boot',
  profileId: null,
  profileName: null,
  gym: null,
  role: 'member',
  pro: false,
  linked: false,
  setUnlocked: (meta) =>
    set({
      status: 'unlocked',
      profileId: meta.id,
      profileName: meta.name,
      gym: meta.gym ?? null,
      role: meta.role,
      /* Not carried over from whoever was unlocked before. Two profiles on one
         device are two accounts, and only one of them may have paid, or have
         an account at all. */
      pro: false,
      linked: false,
    }),
  refreshMeta: (meta) =>
    set((s) => ({
      profileName: meta.name ?? s.profileName,
      gym: meta.gym !== undefined ? meta.gym || null : s.gym,
      role: meta.role ?? s.role,
      pro: meta.pro ?? s.pro,
      linked: meta.linked ?? s.linked,
    })),
  setLocked: () =>
    set({
      status: 'locked',
      profileId: null,
      profileName: null,
      gym: null,
      role: 'member',
      pro: false,
      linked: false,
    }),
}))
