import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, PencilSimple, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
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
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/labels'
import { useCatalogue } from '../store/useCatalogue'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { EmptyState } from '../ui/EmptyState'
import { AdminHiddenExercises } from './admin-hidden-exercises'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

/**
 * Movements the platform writes itself.
 *
 * The bundled catalogue is generated from upstream datasets and frozen — a
 * script owns those files, because their ids are in everybody's logged
 * workouts. Rows written here are the other half: additive, editable the same
 * afternoon somebody notices a movement is missing, and delivered to every
 * member the way recipes already are. The server validates every field again
 * on the way in; this form's job is to say what is wrong before the round trip.
 */

interface Row extends ExerciseRecord {
  updated: string
}

export function AdminExercises() {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ExerciseDraft | null>(null)
  /* Bumped on every open so the form remounts with the row it was given.
     Cheaper than an effect that copies props into state, and correct for
     "New movement" twice in a row, which a key on the row id would not be. */
  const [formSeq, setFormSeq] = useState(0)
  const [reload, setReload] = useState(0)
  const requestId = useRef(0)
  const pull = useCatalogue((s) => s.pull)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const base = activeServer()
  const auth = activeAuthHeader()

  const open = useCallback((draft: ExerciseDraft) => {
    setEditing(draft)
    setFormSeq((n) => n + 1)
  }, [])

  useEffect(() => {
    if (!auth) return undefined
    const id = ++requestId.current
    const filter = debounced
      ? `&filter=${encodeURIComponent(`name ~ "${debounced.replace(/"/g, '')}"`)}`
      : ''
    void fetch(`${base}/api/collections/exercises/records?perPage=60&sort=name${filter}`, {
      headers: auth,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { items: Row[]; totalItems: number }) => {
        if (id !== requestId.current) return
        setRows(data.items)
        setTotal(data.totalItems)
        setError(null)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setError('The sync server did not answer. Movements written here live there, not on this device.')
      })
    return undefined
  }, [base, auth, debounced, reload])

  /* Every write refreshes the member-facing copy too, so the panel and the
     Library never disagree on the device doing the editing. */
  const refresh = useCallback(() => {
    setReload((n) => n + 1)
    void pull()
  }, [pull])

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search movements</span>
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search movements"
            className="pl-9"
          />
        </label>
        <Button variant="primary" onClick={() => open(blankDraft())}>
          <Plus size={16} weight="bold" />
          New movement
        </Button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {rows && rows.length === 0 && !error ? (
        <EmptyState
          title={debounced ? 'Nothing by that name' : 'No movements written yet'}
          description={
            debounced
              ? 'The bundled catalogue is searched in the Library; this list is only what has been written here.'
              : 'The 2,076 bundled movements need no upkeep. This is for the ones they are missing.'
          }
        />
      ) : (
        <Panel padding="lg" className="flex flex-col gap-3">
          <ul className="divide-y divide-line">
            {(rows ?? []).map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                {row.image ? (
                  <img
                    src={`${base}/api/files/exercises/${row.id}/${row.image}?thumb=100x100`}
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
                  <span className="text-sm font-medium text-ink">{row.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Tag tone="brand">
                      {MUSCLE_LABELS[row.muscle as keyof typeof MUSCLE_LABELS] ?? row.muscle}
                    </Tag>
                    <Tag tone="outline">
                      {EQUIPMENT_LABELS[row.equipment as keyof typeof EQUIPMENT_LABELS] ?? row.equipment}
                    </Tag>
                    {!row.published && <Tag>Draft</Tag>}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <IconButton
                    size="xs"
                    aria-label={`Edit ${row.name}`}
                    onClick={() => open(draftFromRecord(row))}
                  >
                    <PencilSimple size={14} weight="bold" />
                  </IconButton>
                  <IconButton size="xs" aria-label={`Delete ${row.name}`} onClick={() => void remove(row)}>
                    <Trash size={14} weight="bold" />
                  </IconButton>
                </span>
              </li>
            ))}
          </ul>
          {rows && total > rows.length && (
            <p className="text-2xs text-ink-3">
              Showing {rows.length} of {total}. Search to narrow it.
            </p>
          )}
        </Panel>
      )}

      <AdminHiddenExercises />

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
