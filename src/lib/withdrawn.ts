/**
 * Movement ids an admin has withdrawn from the library.
 *
 * Device state, not an argument: it arrives from the sync server, it is the
 * same answer for every caller, and the places that need it most — the plan
 * generator and the coach's validator — are pure functions reached from half a
 * dozen call sites that have no business knowing about a store. The same shape
 * `populateByIdCache` already uses, and written only by `useCatalogue`.
 *
 * `exerciseLookup` takes its withdrawn ids as an argument instead, because the
 * components that call it are subscribed to the store anyway and a React memo
 * needs the value in its dependency list to recompute. Two mechanisms, one
 * source: the store writes both.
 */

let withdrawn: ReadonlySet<string> = new Set()

export function setWithdrawn(ids: readonly string[]): void {
  withdrawn = new Set(ids)
}

export function isWithdrawn(exerciseId: string): boolean {
  return withdrawn.has(exerciseId)
}

/** The set itself, for a caller filtering more than one id. */
export function withdrawnIds(): ReadonlySet<string> {
  return withdrawn
}
