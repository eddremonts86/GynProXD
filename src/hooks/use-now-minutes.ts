import { useEffect, useState } from 'react'

/**
 * Minutes since local midnight, refreshed on the half minute.
 *
 * One hook so the timeline's marker and the tile's countdown agree on what
 * "now" is; two intervals would drift apart by up to the interval. Thirty
 * seconds is coarse enough to cost nothing and fine enough that a countdown
 * never looks stuck.
 */
function minutesNow(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function useNowMinutes(): number {
  const [now, setNow] = useState(minutesNow)
  useEffect(() => {
    const id = window.setInterval(() => setNow(minutesNow()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}
