import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowCounterClockwise,
  EyeSlash,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react'
import { activeAuthHeader, activeServer } from '../lib/sync'
import {
  CATEGORY_KEYS,
  EQUIPMENT_KEYS,
  MUSCLE_KEYS,
  blankDraft,
  draftFromRecord,
  draftProblems,
  splitLines,
  type ExerciseDraft,
  type ExerciseRecord,
} from '../lib/exercise-draft'
import { exerciseLookup } from '../lib/exercises'
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/labels'
import { SERVER_ID_PREFIX, toExercise, useCatalogue } from '../store/useCatalogue'
import { useGym } from '../store/useGym'
import type { Exercise } from '../lib/types'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { EmptyState } from '../ui/EmptyState'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

/**
 * The movement catalogue, and what an admin can do to any part of it.
 *
 * This screen used to carry two search boxes over two different universes. The
 * one at the top queried the `exercises` collection — the rows written here,
 * three of them — and the one below it searched all 2,079 movements. Typing
 * "90" into the first answered "Nothing by that name" while the second, four
 * hundred pixels down, found 90/90 Hamstring. The explanatory text under the
 * empty state was accurate and did not help: a tab called Movements whose
 * search excludes almost every movement is wrong however well it is captioned.
 *
 * So there is one search now, over everything, and each result offers what can
 * actually be done to it. A row written here can be edited, deleted and
 * withdrawn. A bundled movement can only be withdrawn — a release is the only
 * thing that edits those, because their ids are in everybody's logged workouts.
 *
 * With no search term the list is what has been written here rather than two
 * thousand rows nobody asked for: the short set that needs upkeep. The search
 * is how you reach the rest.
 *
 * Counts on this screen are counted, never written down. The copy it replaced
 * said "2,076 bundled movements" in one place and the catalogue had already
 * moved on.
 */

interface Row extends ExerciseRecord {
  updated: string
}

interface HiddenRow {
  id: string
  exerciseId: string
  name: string
}

/** How many search results to render. Enough to find a movement, not a page. */
const RESULT_CAP = 24

export function AdminExercises() {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [hidden, setHidden] = useState<HiddenRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<ExerciseDraft | null>(null)
  /* Bumped on every open so the form remounts with the row it was given.
     Cheaper than an effect that copies props into state, and correct for
     "New movement" twice in a row, which a key on the row id would not be. */
  const [formSeq, setFormSeq] = useState(0)
  const [reload, setReload] = useState(0)
  const requestId = useRef(0)
  const pull = useCatalogue((s) => s.pull)
  const customExercises = useGym((s) => s.customExercises)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [term])

  const base = activeServer()
  const auth = activeAuthHeader()

  const open = useCallback((draft: ExerciseDraft) => {
    setEditing(draft)
    setFormSeq((n) => n + 1)
  }, [])

  /**
   * Every row and every withdrawal, once.
   *
   * Unfiltered on purpose. The old query passed the search term to the server,
   * which is why the term could only ever match rows written here; and it asked
   * for `published = true`, which hid the drafts from the one screen whose job
   * is editing them. There are a few dozen rows at most — the 2,076 bundled
   * movements are already in memory — so fetching the lot and searching locally
   * is both simpler and the only way one box can cover both catalogues.
   */
  useEffect(() => {
    if (!auth) return undefined
    const id = ++requestId.current
    void Promise.all([
      fetch(`${base}/api/collections/exercises/records?perPage=500&sort=name`, { headers: auth }),
      fetch(`${base}/api/collections/exercises_hidden/records?perPage=500&sort=-created`, {
        headers: auth,
      }),
    ])
      .then(async ([a, b]) => {
        if (!a.ok || !b.ok) throw new Error(`${a.status}/${b.status}`)
        const written = (await a.json()) as { items: Row[] }
        const withdrawn = (await b.json()) as { items: HiddenRow[] }
        return { written, withdrawn }
      })
      .then(({ written, withdrawn }) => {
        if (id !== requestId.current) return
        setRows(written.items)
        setHidden(withdrawn.items)
        setError(null)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setError(
          'The sync server did not answer. Movements written here live there, not on this device.',
        )
      })
    return undefined
  }, [base, auth, reload])

  /* Every write refreshes the member-facing copy too, so the panel and the
     Library never disagree on the device doing the editing. */
  const refresh = useCallback(() => {
    setReload((n) => n + 1)
    void pull()
  }, [pull])

  /**
   * Every movement the app knows, withdrawn ones included.
   *
   * `exerciseLookup` can drop withdrawn ids and is deliberately not asked to
   * here: this is the one screen that has to see what it took out in order to
   * put it back.
   */
  const universe = useMemo(() => {
    const server = (rows ?? []).map((row) => toExercise(row, base))
    return [...exerciseLookup(customExercises, server).values()]
  }, [rows, base, customExercises])

  const hiddenIds = useMemo(() => new Set((hidden ?? []).map((h) => h.exerciseId)), [hidden])
  const hiddenRowFor = useMemo(
    () => new Map((hidden ?? []).map((h) => [h.exerciseId, h])),
    [hidden],
  )
  /* The prefix is what tells an editable row from a frozen one, and it comes
     from the module that puts it there rather than being spelled again here. */
  const writtenRowFor = useMemo(
    () => new Map((rows ?? []).map((r) => [`${SERVER_ID_PREFIX}${r.id}`, r])),
    [rows],
  )

  const results = useMemo(() => {
    const q = debounced.toLowerCase()
    if (!q) return null
    /* Names only. Matching ids too was the first version and it was noise: the
       wger catalogue numbers its movements `wger-1590`, so "90" returned
       nineteen results of which one had 90 in its name. Nothing was gained
       either — the one place an id is on screen is the withdrawn list, which
       carries its own Restore button and needs no search to reach it. */
    const hit = universe.filter((e) => e.name.toLowerCase().includes(q))
    /* Written-here first: those are the ones an admin came to change, and the
       bundled catalogue would otherwise bury them by sheer weight. */
    hit.sort(
      (a, b) =>
        Number(writtenRowFor.has(b.id)) - Number(writtenRowFor.has(a.id)) ||
        a.name.localeCompare(b.name),
    )
    return { shown: hit.slice(0, RESULT_CAP), total: hit.length }
  }, [debounced, universe, writtenRowFor])

  const written = useMemo(
    () => universe.filter((e) => writtenRowFor.has(e.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [universe, writtenRowFor],
  )

  const withdraw = useCallback(
    async (exercise: Exercise) => {
      if (!auth) return
      setBusy(exercise.id)
      const existing = hiddenRowFor.get(exercise.id)
      await fetch(
        existing
          ? `${base}/api/collections/exercises_hidden/records/${existing.id}`
          : `${base}/api/collections/exercises_hidden/records`,
        existing
          ? { method: 'DELETE', headers: auth }
          : {
              method: 'POST',
              headers: { ...auth, 'content-type': 'application/json' },
              body: JSON.stringify({ exerciseId: exercise.id, name: exercise.name }),
            },
      )
      setBusy(null)
      refresh()
    },
    [auth, base, hiddenRowFor, refresh],
  )

  const remove = useCallback(
    async (row: Row) => {
      if (!auth) return
      await fetch(`${base}/api/collections/exercises/records/${row.id}`, {
        method: 'DELETE',
        headers: auth,
      })
      refresh()
    },
    [auth, base, refresh],
  )

  if (!auth) {
    return (
      <EmptyState
        icon={<WarningCircle size={20} />}
        title="Sign in to sync first"
        description="Movements written here are shared with every member, so they live on the sync server. Settings → Data → Sync."
      />
    )
  }

  const list = results ? results.shown : written
  const listRow = (exercise: Exercise) => (
    <MovementRow
      key={exercise.id}
      exercise={exercise}
      base={base}
      row={writtenRowFor.get(exercise.id)}
      withdrawn={hiddenIds.has(exercise.id)}
      busy={busy === exercise.id}
      onEdit={open}
      onDelete={remove}
      onToggleWithdraw={() => void withdraw(exercise)}
    />
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search every movement</span>
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
        <Button variant="primary" onClick={() => open(blankDraft())}>
          <Plus size={16} weight="bold" />
          New movement
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {rows === null && !error ? (
        /* Skeleton rows at the height the real ones land at, so the panel does
           not jump once the server answers. */
        <Panel padding="lg" className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <span className="size-11 shrink-0 animate-pulse rounded-md bg-surface-2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-3.5 w-2/5 animate-pulse rounded bg-surface-2" />
                <span className="h-2.5 w-1/4 animate-pulse rounded bg-surface-2" />
              </span>
            </div>
          ))}
        </Panel>
      ) : list.length === 0 ? (
        <EmptyState
          title={debounced ? 'Nothing by that name' : 'No movements written yet'}
          description={
            debounced
              ? `This searches all ${universe.length.toLocaleString('en-GB')} movements, bundled ones included. Check the spelling, or try part of the name.`
              : 'The bundled movements need no upkeep. This is for the ones they are missing — and the search above reaches every one of them.'
          }
        />
      ) : (
        <Panel padding="lg" className="flex flex-col gap-3">
          <p className="text-2xs text-ink-3">
            {results
              ? results.total > results.shown.length
                ? `${results.shown.length} of ${results.total} matches. Narrow the search to see the rest.`
                : `${results.total} ${results.total === 1 ? 'match' : 'matches'}`
              : 'Written here. Search above to reach the bundled catalogue.'}
          </p>
          <ul className="divide-y divide-line">{list.map(listRow)}</ul>
        </Panel>
      )}

      <WithdrawnList
        rows={hidden}
        busy={busy}
        onRestore={(row) =>
          void withdraw({ id: row.exerciseId, name: row.name } as Exercise)
        }
      />

      <ExerciseForm
        key={formSeq}
        draft={editing}
        base={base}
        auth={auth}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          refresh()
        }}
      />
    </div>
  )
}

/**
 * One movement, whatever catalogue it came from.
 *
 * The actions are decided by where it came from rather than offered and then
 * refused: there is no Edit on a bundled movement, because a release is the
 * only thing that edits those and a disabled pencil would just be a puzzle.
 */
function MovementRow({
  exercise,
  base,
  row,
  withdrawn,
  busy,
  onEdit,
  onDelete,
  onToggleWithdraw,
}: {
  exercise: Exercise
  base: string
  row?: Row
  withdrawn: boolean
  busy: boolean
  onEdit: (draft: ExerciseDraft) => void
  onDelete: (row: Row) => void
  onToggleWithdraw: () => void
}) {
  const thumb = row?.image
    ? `${base}/api/files/exercises/${row.id}/${row.image}?thumb=100x100`
    : exercise.image
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          aria-hidden="true"
          className="size-11 shrink-0 rounded-md object-cover"
        />
      ) : (
        <span className="num flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-2xs text-ink-3">
          —
        </span>
      )}
      <span className="flex min-w-40 flex-1 flex-col gap-1">
        <span
          className={cn(
            'text-sm font-medium',
            withdrawn ? 'text-ink-3 line-through' : 'text-ink',
          )}
        >
          {exercise.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag tone="brand">{MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle}</Tag>
          <Tag tone="outline">{EQUIPMENT_LABELS[exercise.equipment] ?? exercise.equipment}</Tag>
          {row ? <Tag tone="outline">Written here</Tag> : <Tag tone="outline">Bundled</Tag>}
          {row && !row.published && <Tag>Draft</Tag>}
          {withdrawn && <Tag tone="danger">Withdrawn</Tag>}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <IconButton
          size="xs"
          aria-label={`${withdrawn ? 'Restore' : 'Withdraw'} ${exercise.name}`}
          disabled={busy}
          onClick={onToggleWithdraw}
        >
          {withdrawn ? (
            <ArrowCounterClockwise size={14} weight="bold" />
          ) : (
            <EyeSlash size={14} weight="bold" />
          )}
        </IconButton>
        {row && (
          <>
            <IconButton
              size="xs"
              aria-label={`Edit ${exercise.name}`}
              onClick={() => onEdit(draftFromRecord(row))}
            >
              <PencilSimple size={14} weight="bold" />
            </IconButton>
            <IconButton
              size="xs"
              aria-label={`Delete ${exercise.name}`}
              onClick={() => onDelete(row)}
            >
              <Trash size={14} weight="bold" />
            </IconButton>
          </>
        )}
      </span>
    </li>
  )
}

/**
 * What has been taken out of the library.
 *
 * A list, with no search of its own any more — the one above reaches every
 * movement and offers Withdraw on each. This answers the question search
 * cannot: what have I already withdrawn?
 */
function WithdrawnList({
  rows,
  busy,
  onRestore,
}: {
  rows: HiddenRow[] | null
  busy: string | null
  onRestore: (row: HiddenRow) => void
}) {
  if (!rows || rows.length === 0) return null
  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-ink">Withdrawn from the library</h3>
        <p className="max-w-[62ch] text-2xs text-ink-3">
          {rows.length === 1 ? 'This movement has' : `These ${rows.length} movements have`} stopped
          appearing in the library and the movement picker. Nothing is deleted, and anybody who has
          already trained one keeps it in their history under its own name.
        </p>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <span className="flex min-w-40 flex-1 flex-col gap-0.5">
              <span className="text-sm text-ink">{row.name || row.exerciseId}</span>
              <span className="num text-2xs text-ink-3">{row.exerciseId}</span>
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === row.exerciseId}
              onClick={() => onRestore(row)}
            >
              <ArrowCounterClockwise size={14} weight="bold" />
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function ExerciseForm({
  draft,
  base,
  auth,
  onClose,
  onSaved,
}: {
  draft: ExerciseDraft | null
  base: string
  auth: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  /* The parent remounts this on every open, so the initial value is the whole
     synchronisation story. */
  const [form, setForm] = useState<ExerciseDraft>(draft ?? blankDraft())
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const problems = useMemo(() => draftProblems(form), [form])
  const set = <K extends keyof ExerciseDraft>(key: K, value: ExerciseDraft[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const save = async () => {
    setTouched(true)
    if (Object.keys(problems).length > 0) return
    setSaving(true)
    setFailed(null)

    /* FormData rather than JSON because the picture rides along with the row;
       PocketBase's record API takes both in one request. */
    const body = new FormData()
    body.set('name', form.name.trim())
    body.set('muscle', form.muscle)
    body.set('equipment', form.equipment)
    body.set('category', form.category)
    body.set('instructions', JSON.stringify(splitLines(form.instructions)))
    body.set('published', String(form.published))
    if (file) body.set('image', file)

    const res = await fetch(
      form.id
        ? `${base}/api/collections/exercises/records/${form.id}`
        : `${base}/api/collections/exercises/records`,
      { method: form.id ? 'PATCH' : 'POST', headers: auth, body },
    )
    setSaving(false)
    if (!res.ok) {
      const detail = (await res.json().catch(() => null)) as { message?: string } | null
      setFailed(detail?.message ?? 'The server refused it. Check the fields and try again.')
      return
    }
    onSaved()
  }

  return (
    <Dialog open={!!draft} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit movement' : 'New movement'}</DialogTitle>
          <DialogDescription>
            It reaches every member once published, and appears in the Library beside the bundled
            ones.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <Field label="Name" problem={touched ? problems.name : undefined}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Muscle" problem={touched ? problems.muscle : undefined}>
              <FormSelect
                value={form.muscle}
                onValueChange={(v) => set('muscle', v)}
                ariaLabel="Muscle group"
                options={MUSCLE_KEYS.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
              />
            </Field>
            <Field label="Equipment" problem={touched ? problems.equipment : undefined}>
              <FormSelect
                value={form.equipment}
                onValueChange={(v) => set('equipment', v)}
                ariaLabel="Equipment"
                options={EQUIPMENT_KEYS.map((eq) => ({ value: eq, label: EQUIPMENT_LABELS[eq] }))}
              />
            </Field>
            <Field label="Category" problem={touched ? problems.category : undefined}>
              <FormSelect
                value={form.category}
                onValueChange={(v) => set('category', v)}
                ariaLabel="Category"
                options={CATEGORY_KEYS.map((c) => ({
                  value: c,
                  label: c.charAt(0).toUpperCase() + c.slice(1),
                }))}
              />
            </Field>
          </div>

          <Field
            label="Instructions, one step per line"
            problem={touched ? problems.instructions : undefined}
          >
            <textarea
              value={form.instructions}
              onChange={(e) => set('instructions', e.target.value)}
              rows={6}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors duration-150 focus:border-brand focus:outline-none"
            />
          </Field>

          <Field label="Picture">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-ink-2 file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-2xs file:font-medium file:text-ink-2"
            />
            {form.hasImage && !file && (
              <p className="text-2xs text-ink-3">A picture is already saved; pick one to replace it.</p>
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => set('published', e.target.checked)}
              className="size-4 rounded border-line"
            />
            Published — members can find it
          </label>

          {failed && <p className="text-sm text-danger">{failed}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  problem,
  children,
}: {
  label: string
  problem?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-ink-2">{label}</span>
      {children}
      {problem && <span className="text-2xs text-danger">{problem}</span>}
    </label>
  )
}
