/**
 * Calendar dates in this app are local, not UTC. `toISOString()` shifts a
 * local-midnight Date backwards in any timezone east of UTC, which silently
 * files a session under the wrong day, so every yyyy-mm-dd string goes
 * through here instead.
 */
export function toLocalIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso(): string {
  return toLocalIso(new Date())
}

/** yyyy-mm-dd for `days` ago, used for rolling windows. */
export function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return toLocalIso(d)
}
