/**
 * A position, rounded to a cell before it leaves the device.
 *
 * Five characters is a square about 4.9 km on a side, which is what "near you"
 * means for a night out and coarse enough that the cell says which part of a
 * city somebody is in and nothing more. The server gets the cell and nothing
 * finer, uses it as the cache key, and passes it to the events vendor as the
 * centre of a 25 km search. Standard geohash, so the vendor understands it.
 */
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

export const CELL_PRECISION = 5

export function geohash(lat: number, lng: number, precision = CELL_PRECISION): string {
  let minLat = -90
  let maxLat = 90
  let minLng = -180
  let maxLng = 180
  let bit = 0
  let ch = 0
  let even = true
  let out = ''
  while (out.length < precision) {
    if (even) {
      const mid = (minLng + maxLng) / 2
      if (lng >= mid) {
        ch = ch * 2 + 1
        minLng = mid
      } else {
        ch = ch * 2
        maxLng = mid
      }
    } else {
      const mid = (minLat + maxLat) / 2
      if (lat >= mid) {
        ch = ch * 2 + 1
        minLat = mid
      } else {
        ch = ch * 2
        maxLat = mid
      }
    }
    even = !even
    bit += 1
    if (bit === 5) {
      out += BASE32[ch]
      bit = 0
      ch = 0
    }
  }
  return out
}
