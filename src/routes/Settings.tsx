import { useState } from 'react'
import { useGym } from '../store/useGym'

export function SettingsPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const customExercises = useGym((s) => s.customExercises)
  const importData = useGym((s) => s.importData)
  const [msg, setMsg] = useState('')

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ version: 2, customExercises, workouts, bodyweight }, null, 2)],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gynproxd-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    try {
      const ok = importData(JSON.parse(await file.text()))
      setMsg(ok ? 'Import OK.' : 'Invalid file.')
    } catch {
      setMsg('Invalid JSON.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-2 font-semibold">Your data</h2>
        <p className="mb-3 text-sm text-zinc-500">
          {workouts.length} workouts · {bodyweight.length} weigh-ins · {customExercises.length} custom exercises.
          Everything lives in this browser.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={exportJson}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface"
          >
            Export JSON
          </button>
          <label className="cursor-pointer rounded-xl border border-line px-4 py-2 text-sm">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void importJson(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        {msg && <p className="mt-2 text-sm text-accent">{msg}</p>}
      </section>
      <p className="px-1 text-xs text-zinc-600">GynProXD v0.1.0 — local-first, no account.</p>
    </div>
  )
}
