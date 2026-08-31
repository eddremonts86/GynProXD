import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowCounterClockwise, EyeSlash, MagnifyingGlass } from '@phosphor-icons/react'
import { activeAuthHeader, activeServer } from '../lib/sync'
import { exerciseLookup } from '../lib/exercises'
import { MUSCLE_LABELS } from '../lib/labels'
import { useCatalogue } from '../store/useCatalogue'
import { useGym } from '../store/useGym'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { EmptyState } from '../ui/EmptyState'

/**
 * Withdrawing a movement from the library, whichever catalogue it came from.
 *
 * `published` only ever covered the rows written in the panel. The other 2,076
 * are generated files inside the app bundle — a release is the only way to
 * change them, and their ids are frozen because logged workouts point at them.
 * So this records the id instead, and the library is assembled without it.
 *
 * It hides; it does not delete. A member who has already trained the movement
 * keeps it in their history under its own name, and unhiding puts it back
 * exactly where it was. Nothing is lost either way, which is what makes this
 * safe to do on a whim and undo on a second thought.
 */

interface HiddenRow {
  id: string
  exerciseId: string
  name: string
}

export function AdminHiddenExercises() {
  const [term, setTerm] = useState('')
  const [rows, setRows] = useState<HiddenRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const customExercises = useGym((s) => s.customExercises)
  const serverExercises = useCatalogue((s) => s.exercises)
  const pull = useCatalogue((s) => s.pull)

  const base = activeServer()
  const auth = activeAuthHeader()

  /* The whole library, hidden rows included: this is the one screen that has
     to be able to see what it has withdrawn in order to put it back. */
  const everything = useMemo(
    () => Array.from(exerciseLookup(customExercises, serverExercises).values()),
    [customExercises, serverExercises],
  )

  const load = useCallback(() => {
    if (!auth) return
    void fetch(`${base}/api/collections/exercises_hidden/records?perPage=500&sort=-created`, {
      headers: auth,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { items: HiddenRow[] }) => {
        setRows(data.items)
        setError(null)
      })
      .catch(() => setError('The sync server did not answer.'))
  }, [auth, base])

  useEffect(load, [load])

  const hiddenIds = useMemo(() => new Set((rows ?? []).map((r) => r.exerciseId)), [rows])

  const matches = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (q.length < 2) return []
    return everything
      .filter((e) => !hiddenIds.has(e.id) && e.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [term, everything, hiddenIds])

  const hide = useCallback(
    async (exerciseId: string, name: string) => {
      if (!auth) return
      setBusy(exerciseId)
      await fetch(`${base}/api/collections/exercises_hidden/records`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ exerciseId, name }),
      })
      setBusy(null)
      setTerm('')
      load()
      void pull()
    },
    [auth, base, load, pull],
  )

  const restore = useCallback(
    async (row: HiddenRow) => {
      if (!auth) return
      setBusy(row.exerciseId)
      await fetch(`${base}/api/collections/exercises_hidden/records/${row.id}`, {
        method: 'DELETE',
        headers: auth,
      })
      setBusy(null)
      load()
      void pull()
    },
    [auth, base, load, pull],
  )

  if (!auth) return null

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-ink">Withdrawn from the library</h3>
        <p className="max-w-[62ch] text-2xs text-ink-3">
          Any movement, from any catalogue. It stops appearing in the library and the movement
          picker; it is not deleted, and anybody who has already trained it keeps it in their
          history under its own name.
        </p>
      </div>

      <label className="relative">
        <span className="sr-only">Search every movement to withdraw one</span>
        <MagnifyingGlass
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search every movement…"
          className="pl-9"
        />
      </label>

      {matches.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {matches.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm text-ink">{e.name}</span>
                <Tag tone="outline">{MUSCLE_LABELS[e.muscle]}</Tag>
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === e.id}
                onClick={() => void hide(e.id, e.name)}
              >
                <EyeSlash size={14} weight="bold" />
                Withdraw
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {rows && rows.length === 0 ? (
        <EmptyState
          title="Nothing withdrawn"
          description="Every movement in the catalogue is on offer."
        />
      ) : (
        <ul className="divide-y divide-line">
          {(rows ?? []).map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex min-w-40 flex-1 flex-col gap-0.5">
                <span className="text-sm text-ink">{row.name || row.exerciseId}</span>
                <span className="num text-2xs text-ink-3">{row.exerciseId}</span>
              </span>
              <IconButton
                size="xs"
                aria-label={`Restore ${row.name || row.exerciseId}`}
                disabled={busy === row.exerciseId}
                onClick={() => void restore(row)}
              >
                <ArrowCounterClockwise size={14} weight="bold" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
