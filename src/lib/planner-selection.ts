/**
 * The planner's selected plan, session-scoped. A tiny shared handoff so that
 * "Edit a copy" on a programme page can land the planner on the copy.
 */
const KEY = 'forma-planner-plan'

export function readPlannerSelection(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function writePlannerSelection(id: string | null): void {
  try {
    if (id) sessionStorage.setItem(KEY, id)
    else sessionStorage.removeItem(KEY)
  } catch {
    // Private mode: the selection just does not survive a revisit.
  }
}
