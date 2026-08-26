import { useDeferredValue, useMemo, useState } from 'react'
import { CaretRight, MagnifyingGlass, Plus } from '@phosphor-icons/react'
import { exerciseImageCandidates, exercisePhotoFrames } from '../lib/images'
import { useGym } from '../store/useGym'
import { exerciseLookup } from '../lib/exercises'
import { sessionCountsByExercise } from '../lib/stats'
import { MovementFrames } from '@/components/movement-frames'
import { Button } from '../ui/Button'
import { Tag } from '../ui/Tag'
import { Input } from '../ui/Input'
import { FormSelect } from '../ui/FormSelect'
import { PageHeader } from '../ui/PageHeader'
import { EmptyState } from '../ui/EmptyState'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../lib/labels'
import { cn } from '@/lib/utils'
import type { Equipment, Exercise, MuscleGroup } from '../lib/types'

const MUSCLES: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'other',
]

const EQUIPMENT: Equipment[] = [
  'barbell',
  'dumbbell',
  'bodyweight',
  'machine',
  'cable',
  'kettlebell',
  'band',
  'other',
]

const PAGE = 48

export function LibraryPage() {
  const customExercises = useGym((s) => s.customExercises)
  const addExercise = useGym((s) => s.addExercise)
  const workouts = useGym((s) => s.workouts)

  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all')
  const [equipment, setEquipment] = useState<Equipment | 'all'>('all')
  const [done, setDone] = useState<'all' | 'done' | 'todo'>('all')
  const [visible, setVisible] = useState(PAGE)
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const deferredQuery = useDeferredValue(query)

  const exercises = useMemo(
    () =>
      Array.from(exerciseLookup(customExercises).values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [customExercises],
  )

  /* Only equipment that actually exists in the catalogue; the import maps
     kettlebells and odd implements to "other", so a literal enum would offer
     empty filters. */
  const equipmentOptions = useMemo(() => {
    const present = new Set(exercises.map((e) => e.equipment))
    return EQUIPMENT.filter((e) => present.has(e))
  }, [exercises])

  const doneCounts = useMemo(() => sessionCountsByExercise(workouts), [workouts])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle !== 'all' && e.muscle !== muscle) return false
      if (equipment !== 'all' && e.equipment !== equipment) return false
      if (done === 'done' && !doneCounts.has(e.id)) return false
      if (done === 'todo' && doneCounts.has(e.id)) return false
      if (!q) return true
      return (
        e.name.toLowerCase().includes(q) ||
        e.muscle.includes(q) ||
        e.equipment.includes(q) ||
        MUSCLE_LABELS[e.muscle].toLowerCase().includes(q)
      )
    })
  }, [exercises, deferredQuery, muscle, equipment, done, doneCounts])

  const shown = filtered.slice(0, visible)
  const resetPaging = () => setVisible(PAGE)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Library"
        description="Every movement enForma knows, available offline."
        action={
          <Button variant="secondary" onClick={() => setAddOpen(true)}>
            <Plus size={16} weight="bold" />
            Add your own
          </Button>
        }
      />

      <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-3 bg-bg/90 px-4 py-3 backdrop-blur-md md:-mx-8 md:px-8 lg:top-0">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <MagnifyingGlass
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
            />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                resetPaging()
              }}
              placeholder={`Search ${exercises.length} movements`}
              aria-label="Search movements"
              className="pl-9"
            />
          </div>
          <FormSelect
            value={equipment}
            onValueChange={(v) => {
              setEquipment(v as Equipment | 'all')
              resetPaging()
            }}
            ariaLabel="Filter by equipment"
            className="h-11 w-36 shrink-0 sm:w-44"
            options={[
              { value: 'all', label: 'All equipment' },
              ...equipmentOptions.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] })),
            ]}
          />
          <FormSelect
            value={done}
            onValueChange={(v) => {
              setDone(v as 'all' | 'done' | 'todo')
              resetPaging()
            }}
            ariaLabel="Filter by training history"
            className="h-11 w-32 shrink-0"
            options={[
              { value: 'all', label: 'Any history' },
              { value: 'done', label: 'Done' },
              { value: 'todo', label: 'Not done' },
            ]}
          />
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 md:-mx-8 md:px-8">
          {(['all', ...MUSCLES] as const).map((m) => {
            const active = muscle === m
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMuscle(m)
                  resetPaging()
                }}
                aria-pressed={active}
                className={cn(
                  'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors duration-150',
                  active
                    ? 'border-brand bg-brand text-brand-ink'
                    : 'border-line bg-surface text-ink-3 hover:border-line-strong hover:text-ink',
                )}
              >
                {m === 'all' ? 'All' : MUSCLE_LABELS[m]}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlass size={20} />}
          title="No matches"
          description="Try another word, or clear the filters."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('')
                setMuscle('all')
                setEquipment('all')
                setDone('all')
                resetPaging()
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <p className="num text-2xs text-ink-3">
            {filtered.length === exercises.length
              ? `${exercises.length} movements`
              : `${filtered.length} of ${exercises.length} movements`}
          </p>

          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {shown.map((e) => (
              <li key={e.id}>
                <MovementCard
                  exercise={e}
                  doneCount={doneCounts.get(e.id) ?? 0}
                  onOpen={() => setDetail(e)}
                />
              </li>
            ))}
          </ul>

          {visible < filtered.length && (
            <Button
              variant="secondary"
              onClick={() => setVisible((v) => v + PAGE)}
              className="mx-auto"
            >
              Show {Math.min(PAGE, filtered.length - visible)} more
            </Button>
          )}
        </>
      )}

      <ExerciseDetailDialog exercise={detail} onClose={() => setDetail(null)} />

      <AddExerciseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(exercise) => {
          addExercise(exercise)
          setAddOpen(false)
        }}
      />
    </div>
  )
}

/**
 * Same card anatomy as the recipe suggestions: full-bleed photo on top, then
 * title, fact chips with the muscle as the filled one, a first line of the
 * instructions, and a details affordance pinned to the bottom. Hovering still
 * swaps to the rep's end frame; touch devices simply keep the start frame.
 */
function MovementCard({
  exercise,
  doneCount,
  onOpen,
}: {
  exercise: Exercise
  doneCount: number
  onOpen: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [failed, setFailed] = useState(false)
  const frames = exercisePhotoFrames(exercise)
  const base = exerciseImageCandidates(exercise)[0]
  const src = hovered && frames && !failed ? frames.end : base
  const isCustom = exercise.id.startsWith('custom-')

  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-surface text-left shadow-[var(--shadow-panel)] transition-shadow duration-150 hover:shadow-[var(--shadow-tile)]"
    >
      {base ? (
        <img
          src={src}
          alt={`${exercise.name}, ${exercise.muscle} with ${exercise.equipment}`}
          loading="lazy"
          decoding="async"
          onError={() => (src === frames?.end ? setFailed(true) : undefined)}
          className="aspect-[4/3] w-full bg-surface-2 object-cover"
        />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center bg-surface-2">
          <span className="num text-lg font-semibold tracking-widest text-ink-3">
            {exercise.muscle.slice(0, 3).toUpperCase()}
          </span>
        </span>
      )}
      <span className="flex flex-1 flex-col gap-2 p-4">
        <span className="line-clamp-2 text-sm leading-snug font-semibold text-ink">
          {exercise.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag tone="brand">{MUSCLE_LABELS[exercise.muscle]}</Tag>
          <Tag tone="outline">{EQUIPMENT_LABELS[exercise.equipment]}</Tag>
          {isCustom && <Tag>Yours</Tag>}
          {doneCount > 0 && <Tag tone="good">{doneCount}×</Tag>}
        </span>
        {exercise.instructions?.[0] && (
          <span className="line-clamp-2 text-2xs leading-relaxed text-ink-3">
            {exercise.instructions[0]}
          </span>
        )}
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-2xs font-medium text-brand">
          View movement
          <CaretRight size={12} weight="bold" />
        </span>
      </span>
    </button>
  )
}

function ExerciseDetailDialog({
  exercise,
  onClose,
}: {
  exercise: Exercise | null
  onClose: () => void
}) {

  return (
    <Dialog open={!!exercise} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        {exercise && (
          <>
            <DialogHeader>
              <DialogTitle>{exercise.name}</DialogTitle>
              <DialogDescription>
                {MUSCLE_LABELS[exercise.muscle]} · {EQUIPMENT_LABELS[exercise.equipment]}
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
              <MovementFrames exercise={exercise} />

              {exercise.instructions && exercise.instructions.length > 0 ? (
                <ol className="flex flex-col gap-2.5">
                  {exercise.instructions.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-2">
                      <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs font-semibold text-ink-3">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-ink-3">No instructions available for this movement.</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AddExerciseDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (exercise: Exercise) => void
}) {
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState<MuscleGroup>('chest')
  const [equipment, setEquipment] = useState<Equipment>('barbell')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onAdd({
      id: `custom-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      name: trimmed,
      muscle,
      equipment,
    })
    setName('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add your own movement</DialogTitle>
          <DialogDescription>
            It sits alongside the built-in list and stays on this device.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nordic curl"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <FormSelect
              label="Muscle"
              value={muscle}
              onValueChange={(v) => setMuscle(v as MuscleGroup)}
              options={MUSCLES.map((m) => ({ value: m, label: MUSCLE_LABELS[m] }))}
            />
            <FormSelect
              label="Equipment"
              value={equipment}
              onValueChange={(v) => setEquipment(v as Equipment)}
              options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              Add movement
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
