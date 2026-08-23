import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { exerciseLookup } from '../lib/exercises'
import type { MuscleGroup } from '../lib/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'

const MUSCLE_FILTERS: (MuscleGroup | 'all')[] = [
  'all',
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

export function LibraryPage() {
  const customExercises = useGym((s) => s.customExercises)
  const exercises = useMemo(
    () => Array.from(exerciseLookup(customExercises).values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises],
  )
  const addExercise = useGym((s) => s.addExercise)
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<(typeof MUSCLE_FILTERS)[number]>('all')
  const [name, setName] = useState('')
  const [visible, setVisible] = useState(50)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = exercises
    if (muscle !== 'all') list = list.filter((e) => e.muscle === muscle)
    if (q) {
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.muscle.includes(q) || e.equipment.includes(q),
      )
    }
    return list
  }, [exercises, query, muscle])

  const sliced = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Library"
        description={`${exercises.length} exercises · ${customExercises.length} custom · public-domain images via CDN`}
      />

      <div className="flex flex-col gap-3">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setVisible(50)
          }}
          placeholder={`Search ${exercises.length} exercises…`}
          aria-label="Search exercises"
        />
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {MUSCLE_FILTERS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMuscle(m)
                setVisible(50)
              }}
              className={[
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors',
                muscle === m
                  ? 'border-accent bg-accent text-surface'
                  : 'border-line bg-card text-zinc-400 hover:border-line-strong hover:text-zinc-200',
              ].join(' ')}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Showing {sliced.length} of {filtered.length}
          {query || muscle !== 'all' ? ` · filtered` : ''}
        </p>
      </div>

      {sliced.length === 0 ? (
        <EmptyState title="No matches" description="Try a different keyword or muscle filter." />
      ) : (
        <div className="flex flex-col gap-2">
          {sliced.map((e) => (
            <Card key={e.id} padding="sm" className="flex gap-3">
              {e.image ? (
                <img
                  src={e.image}
                  alt=""
                  loading="lazy"
                  className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] bg-surface-2 object-cover"
                  onError={(ev) => {
                    ;(ev.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-2 text-[10px] font-bold tracking-wide text-muted">
                  {e.muscle.slice(0, 3).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-100">{e.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{e.muscle}</Badge>
                  <Badge variant="muted">{e.equipment}</Badge>
                </div>
              </div>
            </Card>
          ))}
          {hasMore && (
            <Button
              variant="secondary"
              onClick={() => setVisible((v) => Math.min(filtered.length, v + 50))}
              className="mt-2 w-full"
            >
              Load more — {filtered.length - visible} remaining
            </Button>
          )}
        </div>
      )}

      <Card>
        <h2 className="text-sm font-semibold text-zinc-100">Add custom exercise</h2>
        <p className="mt-1 text-xs leading-4 text-muted">It’s stored locally and overlays the public dataset.</p>
        <form
          onSubmit={(ev) => {
            ev.preventDefault()
            const trimmed = name.trim()
            if (!trimmed) return
            addExercise({
              id: `custom-${trimmed.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
              name: trimmed,
              muscle: 'core' satisfies MuscleGroup,
              equipment: 'other',
            })
            setName('')
          }}
          className="mt-3 flex gap-2"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add your own exercise…"
            aria-label="New exercise name"
            className="flex-1"
          />
          <Button type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </form>
      </Card>
    </div>
  )
}
