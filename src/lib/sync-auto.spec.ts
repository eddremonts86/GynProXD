import { describe, expect, it } from 'vitest'
import { BACKOFF_MS, IDLE_MS, createAutoSync } from './sync-auto'

/**
 * The scheduler, on a fake clock.
 *
 * Four behaviours, and each one is a bug that existed before it: a burst of
 * changes must be one sync, a change arriving mid-sync must not be dropped, a
 * server that is down must not be asked on every keystroke, and a tab waking
 * up must not push a scheduled sync further away.
 */
function harness(runs: { ok: boolean }[] = []) {
  let now = 0
  const timers: { at: number; fn: () => void; id: number }[] = []
  let nextId = 1
  const calls: string[] = []
  let pendingResolve: ((value: { ok: boolean }) => void) | null = null

  const auto = createAutoSync({
    run: (profileId) => {
      calls.push(profileId)
      const scripted = runs.shift()
      if (scripted) return Promise.resolve(scripted)
      /* Left hanging, so a test can decide when the run finishes. */
      return new Promise((resolve) => {
        pendingResolve = resolve
      })
    },
    linked: () => true,
    now: () => now,
    schedule: (fn, ms) => {
      const id = nextId++
      timers.push({ at: now + ms, fn, id })
      return id
    },
    cancel: (handle) => {
      const i = timers.findIndex((t) => t.id === handle)
      if (i !== -1) timers.splice(i, 1)
    },
  })

  return {
    auto,
    calls,
    advance(ms: number) {
      now += ms
      for (const t of [...timers].sort((a, b) => a.at - b.at)) {
        if (t.at > now) continue
        const i = timers.indexOf(t)
        if (i !== -1) timers.splice(i, 1)
        t.fn()
      }
    },
    /** Finish the run this harness left hanging. */
    async finish(ok: boolean) {
      pendingResolve?.({ ok })
      pendingResolve = null
      /* Two turns: the result handler, then the one that re-arms. */
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    },
    at: () => now,
  }
}

describe('the auto sync', () => {
  it('turns a burst of changes into one sync', () => {
    const h = harness([{ ok: true }])
    h.auto.changed('p')
    h.advance(500)
    h.auto.changed('p')
    h.advance(500)
    h.auto.changed('p')
    expect(h.calls).toEqual([])
    h.advance(IDLE_MS)
    expect(h.calls).toEqual(['p'])
  })

  it('does not run two at once, and does not lose the change that arrived mid-run', async () => {
    const h = harness()
    h.auto.changed('p')
    h.advance(IDLE_MS)
    expect(h.calls).toEqual(['p'])
    expect(h.auto.state().running).toBe(true)

    /* Two changes while it is in flight. `syncNow` would answer `busy` and the
       old code would have dropped both. */
    h.auto.changed('p')
    h.auto.changed('p')
    h.advance(IDLE_MS)
    expect(h.calls).toEqual(['p'])
    expect(h.auto.state().again).toBe(true)

    await h.finish(true)
    /* One more pass, not two, however many changes arrived. */
    h.advance(IDLE_MS)
    expect(h.calls).toEqual(['p', 'p'])
  })

  it('backs off after a failure rather than asking again on the next keystroke', async () => {
    const h = harness([{ ok: false }, { ok: true }])
    h.auto.changed('p')
    h.advance(IDLE_MS)
    expect(h.calls).toHaveLength(1)
    await h.finish(false)
    expect(h.auto.state().blockedUntil).toBe(h.at() + BACKOFF_MS)

    h.auto.changed('p')
    h.advance(IDLE_MS)
    expect(h.calls, 'still inside the backoff').toHaveLength(1)
    h.advance(BACKOFF_MS)
    expect(h.calls, 'and once it is over').toHaveLength(2)
  })

  it('a tab waking up does not push a scheduled sync further away', () => {
    const h = harness([{ ok: true }])
    h.auto.changed('p')
    h.advance(IDLE_MS - 200)
    /* Three wakes in the last stretch. Re-arming on each would starve it. */
    h.auto.wake('p')
    h.auto.wake('p')
    h.auto.wake('p')
    h.advance(200)
    expect(h.calls).toEqual(['p'])
  })

  it('a wake with nothing pending syncs at once', () => {
    const h = harness([{ ok: true }])
    h.auto.wake('p')
    h.advance(0)
    expect(h.calls).toEqual(['p'])
  })

  it('stopping forgets the pending work, because a locked profile has no key', () => {
    const h = harness([{ ok: true }])
    h.auto.changed('p')
    h.auto.stop()
    h.advance(IDLE_MS * 2)
    expect(h.calls).toEqual([])
  })

  it('does nothing at all for a profile with no account', () => {
    let now = 0
    const calls: string[] = []
    const auto = createAutoSync({
      run: (id) => {
        calls.push(id)
        return Promise.resolve({ ok: true })
      },
      linked: () => false,
      now: () => now,
      schedule: (fn) => {
        fn()
        return 1
      },
      cancel: () => {},
    })
    auto.changed('p')
    auto.wake('p')
    now += IDLE_MS
    expect(calls).toEqual([])
  })
})
