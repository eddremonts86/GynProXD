import { useMemo, useState } from 'react'
import { useGym } from '../store/useGym'
import { exerciseLookup } from '../lib/exercises'
import type { MuscleGroup } from '../lib/types'

export function LibraryPage() {
  const customExercises = useGym((s) => s.customExercises)
  const exercises = useMemo(
    () => Array.from(exerciseLookup(customExercises).values()).sort((a, b) => a.name.localeCompare(b.name)),
    [customExercises],
  )
  const addExercise = useGym((s) => s.addExercise)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? exercises.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.muscle.includes(q) ||
          e.equipment.includes(q),
      )
    : exercises

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Library</h1>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${exercises.length} exercises…`}
        className="rounded-xl border border-line bg-card px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-accent"
      />
      <ul className="divide-y divide-line rounded-xl border border-line bg-card">
        {filtered.map((e) => (
          <li key={e.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{e.name}</p>
              <p className="text-xs text-zinc-500">
                {e.muscle} · {e.equipment}
              </p>
            </div>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-zinc-500">No matches.</li>
        )}
      </ul>
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
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add your own exercise…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-3 text-sm outline-none placeholder:text-zinc-600 focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-surface"
        >
          Add
        </button>
      </form>
    </div>
  )
}
