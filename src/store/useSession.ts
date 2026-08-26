import { create } from 'zustand'
import type { ProfileRole } from '../lib/profiles'

/** Whether a profile is unlocked. The key itself lives in lib/profiles. */
interface SessionState {
  status: 'boot' | 'locked' | 'unlocked'
  profileId: string | null
  profileName: string | null
  gym: string | null
  role: ProfileRole
  setUnlocked: (meta: { id: string; name: string; gym?: string; role: ProfileRole }) => void
  /** Refreshes name/gym after a Settings edit without re-unlocking. */
  refreshMeta: (meta: { name?: string; gym?: string }) => void
  setLocked: () => void
}

export const useSession = create<SessionState>()((set) => ({
  status: 'boot',
  profileId: null,
  profileName: null,
  gym: null,
  role: 'member',
  setUnlocked: (meta) =>
    set({
      status: 'unlocked',
      profileId: meta.id,
      profileName: meta.name,
      gym: meta.gym ?? null,
      role: meta.role,
    }),
  refreshMeta: (meta) =>
    set((s) => ({
      profileName: meta.name ?? s.profileName,
      gym: meta.gym !== undefined ? meta.gym || null : s.gym,
    })),
  setLocked: () =>
    set({ status: 'locked', profileId: null, profileName: null, gym: null, role: 'member' }),
}))
