/**
 * FNV-1a over a string, as an unsigned 32-bit integer. Every device hashes
 * the same text to the same number, so date-seeded daily picks converge
 * across devices with no backend.
 */
export function seedFrom(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
