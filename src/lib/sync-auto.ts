/**
 * When a linked profile syncs, which until now was "on unlock, or when asked".
 *
 * That is not sync. Two devices with the same account diverged for as long as
 * nobody pressed a button, and the button is in Settings → Data where a member
 * has no reason to go. An account that syncs has to sync: after every change,
 * on a slow timer, and when the tab comes back to life.
 *
 * **Four rules, and each one is here because the naive version breaks it.**
 *
 *   *Coalesce.* A form being filled is dozens of store writes. Each one must
 *   not be a round trip, so a change schedules a sync a little after the last
 *   one rather than immediately.
 *
 *   *Never overlap.* `syncNow` already refuses to run twice at once and
 *   answers `busy`. Left at that, a change arriving mid-sync would be dropped
 *   and wait for the next trigger, which is the bug the button was hiding. So
 *   a request during a run sets a flag and the run repeats once, one more
 *   time, when it finishes.
 *
 *   *Back off on failure.* A server that is down would otherwise be asked
 *   again on every keystroke's debounce. After a failure nothing is attempted
 *   for a while, and the next success clears that.
 *
 *   *Stay quiet.* Nothing here reports anything. A failed background sync is a
 *   thing Settings → Data says, where it can be acted on; a toast for it would
 *   interrupt somebody mid-set to tell them about a network.
 *
 * The timer functions are injected so `sync-auto.spec.ts` can drive all of it
 * without waiting for real seconds or standing up a server.
 */

/* ------------------------------------------------- whose change was it */

/**
 * Whether the writes arriving in the store right now are the sync's own.
 *
 * A pull ends by rehydrating the store from disk, which is a store change like
 * any other: the autosave subscription fires, the save schedules a sync, that
 * sync pulls, and round it goes. On a first sync after an account is created
 * this spun hard enough to take the tab down.
 *
 * So the engine says when a change is its own and the autosave asks. It is a
 * flag rather than an argument because the thing that has to ask is a Zustand
 * subscriber, which is handed nothing and runs synchronously — which is also
 * what makes a flag correct here rather than racy: it is read in the same tick
 * it is set for.
 *
 * It lives in this module because it is the one both sides can import without
 * a cycle: `sync.ts` imports `profiles.ts`, `profiles.ts` needs to ask, and
 * this file imports nothing at all.
 */
let applyingRemote = false

export function markApplyingRemote(on: boolean): void {
  applyingRemote = on
}

export function isApplyingRemote(): boolean {
  return applyingRemote
}

/** After the last change. Long enough to swallow a burst of typing. */
export const IDLE_MS = 2_000
/** The slow heartbeat, for what another device wrote while this one sat still. */
export const PERIOD_MS = 5 * 60 * 1_000
/** Quiet time after a failure, so a server that is down is not hammered. */
export const BACKOFF_MS = 60_000

export interface AutoSyncDeps {
  /** The real work. Resolves whether it got through. */
  run: (profileId: string) => Promise<{ ok: boolean }>
  /** False when this profile has no account, when there is nothing to do. */
  linked: (profileId: string) => boolean
  now: () => number
  schedule: (fn: () => void, ms: number) => number
  cancel: (handle: number) => void
}

export interface AutoSync {
  /** A local change landed. Schedules a sync, coalescing with any pending one. */
  changed: (profileId: string) => void
  /** Sync as soon as the rules allow: a heartbeat, a tab waking, a reconnect. */
  wake: (profileId: string) => void
  /** Forget any pending work. Called when a profile locks. */
  stop: () => void
  /** For the spec, and for a status line if one is ever wanted. */
  state: () => { pending: boolean; running: boolean; again: boolean; blockedUntil: number }
}

export function createAutoSync(deps: AutoSyncDeps): AutoSync {
  let timer: number | null = null
  let running = false
  let again = false
  let blockedUntil = 0

  const clear = () => {
    if (timer !== null) deps.cancel(timer)
    timer = null
  }

  const fire = (profileId: string) => {
    timer = null
    if (!deps.linked(profileId)) return
    if (running) {
      /* Somebody changed something while a run was in flight. One more pass
         after this one, and only one however many changes arrived. */
      again = true
      return
    }
    running = true
    void deps
      .run(profileId)
      .then((result) => {
        blockedUntil = result.ok ? 0 : deps.now() + BACKOFF_MS
      })
      .catch(() => {
        /* A throw is a failure like any other. Quiet, and backed off. */
        blockedUntil = deps.now() + BACKOFF_MS
      })
      .then(() => {
        running = false
        if (!again) return
        again = false
        /* Straight back round, at the idle delay rather than at once: whatever
           changed mid-run may still be changing. */
        arm(profileId, IDLE_MS)
      })
  }

  const arm = (profileId: string, ms: number) => {
    if (!deps.linked(profileId)) return
    const wait = Math.max(ms, blockedUntil - deps.now())
    clear()
    timer = deps.schedule(() => fire(profileId), wait)
  }

  return {
    changed: (profileId) => arm(profileId, IDLE_MS),
    /* A wake is not a change: if a sync is already scheduled, that one will do,
       and re-arming would push it further away every time the tab is touched. */
    wake: (profileId) => {
      if (timer !== null || running) return
      arm(profileId, 0)
    },
    stop: () => {
      clear()
      again = false
    },
    state: () => ({ pending: timer !== null, running, again, blockedUntil }),
  }
}
