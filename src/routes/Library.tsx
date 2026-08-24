import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { exerciseLookup } from '../lib/exercises'
import type { Exercise, MuscleGroup } from '../lib/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Input } from '../ui/Input'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { getExerciseImage, REPDB_COUNT } from '@/lib/images'

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
  const [detail, setDetail] = useState<Exercise | null>(null)

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
        eyebrow="Forma · Library"
        title="Movements"
        description={`Offline collection · ${exercises.length} public-domain · ${customExercises.length} custom · ${REPDB_COUNT} RepDB flat WebP · warm, human, 3D plate`}
      />

      <Illustration variant="orb" className="h-20 w-full" />

      <div className="flex flex-col gap-3">
        <label htmlFor="library-search" className="sr-only">
          Search movements
        </label>
        <Input
          id="library-search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setVisible(50)
          }}
          placeholder={`Search ${exercises.length} movements…`}
          aria-label="Search exercises"
        />
        <ScrollArea>
          <div className="flex gap-1.5 pb-1" role="group" aria-label="Filter by muscle">
            {MUSCLE_FILTERS.map((m) => (
              <button
                key={m}
                onClick={() => {
                  setMuscle(m)
                  setVisible(50)
                }}
                aria-pressed={muscle === m}
                className={[
                  'shrink-0 rounded-full border px-4 py-2.5 text-xs font-medium capitalize transition-colors tracking-wide min-h-11',
                  muscle === m
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-line bg-card text-muted hover:border-line-strong hover:text-ink-soft',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        <p className="text-xs tracking-wide text-muted uppercase">
          Showing {sliced.length} of {filtered.length}
          {query || muscle !== 'all' ? ` · filtered` : ''} · hybrid calisthenics
        </p>
      </div>

      {sliced.length === 0 ? (
        <EmptyState title="No matches" description="Try a different keyword or muscle. Warm, human, offline." />
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {sliced.map((e) => {
            const img = getExerciseImage(e.id, e.image)
            return (
              <Card key={e.id} padding="sm" hover className="flex gap-3 cursor-pointer text-left"
                onClick={() => setDetail(e)}
                role="button"
                tabIndex={0}
                onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setDetail(e) } }}
                aria-label={`Ver detalle de ${e.name}`}
              >
                {img ? (
                  <img
                    src={img}
                    sizes="56px"
                    alt={`${e.name} — ${e.muscle} ${e.equipment}`}
                    loading="lazy"
                    decoding="async"
                    width={56}
                    height={56}
                    className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] bg-surface-2 object-cover border border-line/40"
                    onError={(ev) => {
                      ;(ev.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-2 text-[10px] font-bold tracking-widest text-muted border border-line/40">
                  {e.muscle.slice(0, 3).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm text-ink">{e.name}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge>{e.muscle}</Badge>
                  <Badge variant="muted">{e.equipment}</Badge>
                </div>
              </div>
            </Card>
            )
          })}
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

      <Dialog open={!!detail} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-xl">{detail.name}</DialogTitle>
                <DialogDescription className="flex flex-wrap gap-1.5 pt-1">
                  <Badge>{detail.muscle}</Badge>
                  <Badge variant="muted">{detail.equipment}</Badge>
                </DialogDescription>
              </DialogHeader>
              {(() => {
                const img = getExerciseImage(detail.id, detail.image)
                return img ? (
                  <img
                    src={img}
                    alt={`${detail.name} — ${detail.muscle} ${detail.equipment}`}
                    loading="lazy"
                    decoding="async"
                    className="h-48 w-full rounded-[var(--radius-md)] bg-surface-2 object-contain border border-line/40"
                  />
                ) : null
              })()}
              {detail.instructions && detail.instructions.length > 0 ? (
                <ol className="flex flex-col gap-2 overflow-y-auto max-h-64 pr-1">
                  {detail.instructions.map((step, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-5 text-ink-soft">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-bold text-accent">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-muted">Sin instrucciones disponibles para este movimiento.</p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Card>
        <h2 className="font-display text-lg text-ink">Add custom movement</h2>
        <p className="mt-1 text-sm leading-5 text-muted">Yours, local-first. Overlays the 873 public-domain set.</p>
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
          className="mt-4 flex gap-2"
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add your own — e.g. Nordic curl"
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
