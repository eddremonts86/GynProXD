/**
 * A collection is a hub shaped like a life situation, not a muscle group:
 * "desk worker", "back at the gym", "no equipment today". Members recognise
 * their circumstances faster than their anatomy, which is why these retain
 * better than a muscle filter. Definitions are plain data — bundled or
 * published by a gym — and reference the bundled catalogue by id.
 */

export interface Collection {
  id: string
  name: string
  blurb?: string
  exerciseIds: string[]
  source: 'bundled' | 'gym'
}

/** Ids the catalogue does not know are dropped rather than rendered broken. */
export function validCollectionIds(ids: string[], known: (id: string) => boolean): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id) || !known(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}
