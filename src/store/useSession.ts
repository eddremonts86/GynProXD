import { create } from 'zustand'

/** Whether a profile is unlocked. The key itself lives in lib/profiles. */
interface SessionState {
  status: 'boot' | 'locked' | 'unlocked'
  profileName: string | null
  setUnlocked: (name: string) => void
  setLocked: () => void
}

export const useSession = create<SessionState>()((set) => ({
  status: 'boot',
  profileName: null,
  setUnlocked: (name) => set({ status: 'unlocked', profileName: name }),
  setLocked: () => set({ status: 'locked', profileName: null }),
}))
