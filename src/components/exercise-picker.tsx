import { useDeferredValue, useMemo, useState } from 'react'
import { MagnifyingGlass } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Input } from '@/ui/Input'
import { Tag } from '@/ui/Tag'
import { ExerciseThumb } from '@/ui/ExerciseThumb'
import { exerciseLookup } from '@/lib/exercises'
import { MUSCLE_LABELS, EQUIPMENT_LABELS } from '@/lib/labels'
import { useGym } from '@/store/useGym'
import { useCatalogue } from '@/store/useCatalogue'
import type { Exercise } from '@/lib/types'

interface ExercisePickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (exercise: Exercise) => void
  title?: string
  description?: string
  /** Ids already in the target list, shown as "added" and not selectable. */
  excludeIds?: string[]
}

const PAGE = 40

/** One search surface for every "pick a movement" moment in the app. */
export function ExercisePicker({
  open,
  onOpenChange,
  onSelect,
  title = 'Add a movement',
  description = 'Search by name, muscle or equipment.',
  excludeIds = [],
}: ExercisePickerProps) {
  const customExercises = useGym((s) => s.customExercises)
  const serverExercises = useCatalogue((s) => s.exercises)
  const hidden = useCatalogue((s) => s.hidden)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)

  const all = useMemo(
    () =>
      Array.from(exerciseLookup(customExercises, serverExercises, hidden).values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [customExercises, serverExercises, hidden],
  )

  const results = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return all.slice(0, PAGE)
    return all
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.muscle.includes(q) ||
          e.equipment.includes(q) ||
          MUSCLE_LABELS[e.muscle].toLowerCase().includes(q),
      )
      .slice(0, PAGE)
  }, [all, deferredQuery])

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Bench press, squat, core"
            aria-label="Search movements"
            autoFocus
            className="pl-9"
          />
        </div>

        <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-3">
              Nothing matches "{deferredQuery.trim()}".
            </p>
          ) : (
            results.map((e) => {
              const added = excluded.has(e.id)
              return (
                <button
                  key={e.id}
                  type="button"
                  disabled={added}
                  onClick={() => {
                    onSelect(e)
                    setQuery('')
                  }}
                  className="flex items-center gap-3 rounded-md border border-transparent p-2 text-left transition-colors hover:border-line hover:bg-surface-2 disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent"
                >
                  <ExerciseThumb exercise={e} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{e.name}</span>
                    <span className="block text-2xs text-ink-3">
                      {MUSCLE_LABELS[e.muscle]} · {EQUIPMENT_LABELS[e.equipment]}
                    </span>
                  </span>
                  {added && <Tag tone="neutral">Added</Tag>}
                </button>
              )
            })
          )}
          {!deferredQuery.trim() && all.length > PAGE && (
            <p className="px-2 py-3 text-2xs text-ink-3">
              Showing the first {PAGE}. Type to search all {all.length}.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
