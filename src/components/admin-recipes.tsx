import { Textarea } from '@/components/ui/textarea'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MagnifyingGlass, PencilSimple, Plus, Trash, WarningCircle } from '@phosphor-icons/react'
import { activeAuthHeader, activeServer } from '../lib/sync'
import { CATEGORY_KEYS, type RecipeDraft, blankDraft, draftFromRecord, draftProblems } from '../lib/recipe-draft'
import { Button, IconButton } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { EmptyState } from '../ui/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

/**
 * The gym's own recipes. Rows written here are `house` provider: ours to keep,
 * with no vendor terms and no 24 hour clock, and they surface everywhere the
 * imported ones do. The server validates every field again on the way in —
 * this form's job is to say what is wrong before the round trip.
 */

interface RecipeRow {
  id: string
  title: string
  category: string
  provider: string
  kcal: number
  proteinG: number
  servings: number
  image: string
  imageUrl: string
  directions: unknown
  ingredients: unknown
  readyInMinutes: number
}

export function AdminRecipes() {
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [rows, setRows] = useState<RecipeRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RecipeDraft | null>(null)
  const [reload, setReload] = useState(0)
  const requestId = useRef(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const base = activeServer()
  const auth = activeAuthHeader()

  useEffect(() => {
    if (!auth) return undefined
    const id = ++requestId.current
    const filter = debounced
      ? `&filter=${encodeURIComponent(`title ~ "${debounced.replace(/"/g, '')}"`)}`
      : ''
    void fetch(
      `${base}/api/collections/recipes/records?perPage=40&sort=-created${filter}`,
      { headers: auth },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { items: RecipeRow[]; totalItems: number }) => {
        if (id !== requestId.current) return
        setRows(data.items)
        setTotal(data.totalItems)
        setError(null)
      })
      .catch(() => {
        if (id !== requestId.current) return
        setError('The sync server did not answer. Recipes live there, not on this device.')
      })
    return undefined
  }, [base, auth, debounced, reload])

  const remove = useCallback(
    async (row: RecipeRow) => {
      if (!auth) return
      await fetch(`${base}/api/collections/recipes/records/${row.id}`, {
        method: 'DELETE',
        headers: auth,
      })
      setReload((n) => n + 1)
    },
    [auth, base],
  )

  if (!auth) {
    return (
      <EmptyState
        icon={<WarningCircle size={20} />}
        title="Sign in to sync first"
        description="Recipes are shared across the gym, so they live on the sync server. Settings → Data → Sync."
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative min-w-56 flex-1">
          <span className="sr-only">Search recipes</span>
          <MagnifyingGlass
            size={15}
            weight="bold"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
          />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by name"
            className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm text-ink placeholder:text-ink-3 focus:border-line-strong focus:outline-none"
          />
        </label>
        <Button onClick={() => setEditing(blankDraft())}>
          <Plus size={16} weight="bold" />
          New recipe
        </Button>
      </div>

      {error ? (
        <EmptyState icon={<WarningCircle size={20} />} title="Could not load" description={error} />
      ) : rows === null ? (
        <Panel padding="lg">
          <p className="text-sm text-ink-3">Loading the catalogue…</p>
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          title={debounced ? 'Nothing matches that' : 'No recipes yet'}
          description={
            debounced
              ? 'Try a shorter word.'
              : 'Add the gym’s own dishes here; they show up alongside the imported ones.'
          }
        />
      ) : (
        <Panel padding="lg">
          <p className="pb-3 text-2xs text-ink-3">
            <span className="num">{rows.length}</span> of <span className="num">{total}</span>{' '}
            in the catalogue
          </p>
          <ul className="divide-y divide-line">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0">
                <img
                  src={
                    row.image
                      ? `${base}/api/files/recipes/${row.id}/${row.image}`
                      : row.imageUrl
                  }
                  alt=""
                  loading="lazy"
                  className="size-10 shrink-0 rounded-lg bg-surface-2 object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm text-ink">{row.title}</span>
                  <span className="num text-2xs text-ink-3">
                    {row.kcal} kcal · {row.proteinG} g · {row.category}
                  </span>
                </span>
                {row.provider === 'house' ? (
                  <Tag tone="brand">House</Tag>
                ) : (
                  <Tag tone="outline">{row.provider}</Tag>
                )}
                <IconButton
                  size="xs"
                  aria-label={`Edit ${row.title}`}
                  onClick={() => setEditing(draftFromRecord(row))}
                >
                  <PencilSimple size={14} weight="bold" />
                </IconButton>
                <IconButton
                  size="xs"
                  aria-label={`Delete ${row.title}`}
                  onClick={() => void remove(row)}
                >
                  <Trash size={14} weight="bold" />
                </IconButton>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <RecipeForm
        /* Remounting on a different recipe is how the form resets: no effect
           syncing props into state, no stale file input. */
        key={editing ? (editing.id ?? 'new') : 'closed'}
        draft={editing}
        base={base}
        auth={auth}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          setReload((n) => n + 1)
        }}
      />
    </div>
  )
}

function RecipeForm({
  draft,
  base,
  auth,
  onClose,
  onSaved,
}: {
  draft: RecipeDraft | null
  base: string
  auth: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<RecipeDraft | null>(draft)
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  const problems = useMemo(
    () => (form ? draftProblems(form, file !== null) : {}),
    [form, file],
  )
  const complete = Object.keys(problems).length === 0

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f))

  const save = async () => {
    if (!form || !complete) {
      setTouched(true)
      return
    }
    setSaving(true)
    setServerError(null)
    const body = new FormData()
    body.set('title', form.title.trim())
    body.set('category', form.category)
    body.set('kcal', form.kcal)
    body.set('proteinG', form.proteinG)
    body.set('servings', form.servings)
    if (form.readyInMinutes.trim()) body.set('readyInMinutes', form.readyInMinutes)
    body.set('directions', JSON.stringify(splitLines(form.directions)))
    body.set('ingredients', JSON.stringify(splitLines(form.ingredients)))
    if (file) body.set('image', file)

    const res = await fetch(
      form.id
        ? `${base}/api/collections/recipes/records/${form.id}`
        : `${base}/api/collections/recipes/records`,
      { method: form.id ? 'PATCH' : 'POST', headers: auth, body },
    )
    setSaving(false)
    if (res.ok) {
      onSaved()
      return
    }
    const payload = (await res.json().catch(() => ({}))) as { message?: string }
    setServerError(payload.message ?? 'The server refused that.')
  }

  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form?.id ? 'Edit recipe' : 'New recipe'}</DialogTitle>
          <DialogDescription>
            Everything here is shown to members, so every field is required. Nutrition is per
            serving.
          </DialogDescription>
        </DialogHeader>

        {form && (
          <div className="flex flex-col gap-4">
            <Field label="Name" problem={touched ? problems.title : undefined}>
              <Input value={form.title} onChange={(e) => set('title', e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Course" problem={touched ? problems.category : undefined}>
                <FormSelect
                  value={form.category}
                  onValueChange={(v) => set('category', v)}
                  ariaLabel="Course"
                  options={CATEGORY_KEYS.map((k) => ({
                    value: k,
                    label: k.charAt(0).toUpperCase() + k.slice(1),
                  }))}
                />
              </Field>
              <Field label="Ready in (min)">
                <Input
                  inputMode="numeric"
                  value={form.readyInMinutes}
                  onChange={(e) => set('readyInMinutes', e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="kcal / serving" problem={touched ? problems.kcal : undefined}>
                <Input
                  inputMode="numeric"
                  value={form.kcal}
                  onChange={(e) => set('kcal', e.target.value)}
                />
              </Field>
              <Field label="Protein g" problem={touched ? problems.proteinG : undefined}>
                <Input
                  inputMode="numeric"
                  value={form.proteinG}
                  onChange={(e) => set('proteinG', e.target.value)}
                />
              </Field>
              <Field label="Servings" problem={touched ? problems.servings : undefined}>
                <Input
                  inputMode="numeric"
                  value={form.servings}
                  onChange={(e) => set('servings', e.target.value)}
                />
              </Field>
            </div>

            <Field label="Photo" problem={touched ? problems.image : undefined}>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-2xs text-ink-3 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-2xs file:text-ink"
              />
              {form.hasImage && !file && (
                <p className="text-2xs text-ink-3">A photo is already saved; pick one to replace it.</p>
              )}
            </Field>

            <Field
              label="Ingredients, one per line"
              problem={touched ? problems.ingredients : undefined}
            >
              <Textarea
                rows={5}
                value={form.ingredients}
                onChange={(e) => set('ingredients', e.target.value)}
              />
            </Field>

            <Field label="Method, one step per line" problem={touched ? problems.directions : undefined}>
              <Textarea
                rows={6}
                value={form.directions}
                onChange={(e) => set('directions', e.target.value)}
              />
            </Field>

            {serverError && <p className="text-2xs text-danger">{serverError}</p>}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : form.id ? 'Save changes' : 'Add recipe'}
              </Button>
            </div>
          </div>
        )}
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
    <label className="flex flex-col gap-2">
      <span className="text-2xs font-medium text-ink-2">{label}</span>
      {children}
      {problem && <span className="text-2xs text-danger">{problem}</span>}
    </label>
  )
}

function splitLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
