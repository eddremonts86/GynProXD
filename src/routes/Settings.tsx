import { useState } from 'react'
import { useGym } from '../store/useGym'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'

export function SettingsPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const customExercises = useGym((s) => s.customExercises)
  const plans = useGym((s) => s.plans)
  const importData = useGym((s) => s.importData)
  const [msg, setMsg] = useState('')

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 3, customExercises, workouts, bodyweight, plans }, null, 2)], {
      type: 'application/json',
    })
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
    <div className="flex flex-col gap-5">
      <PageHeader title="Settings" description="Manage your local data. No account, no server." />

      <Card>
        <h2 className="text-sm font-semibold text-zinc-100">Your data</h2>
        <p className="mt-1 text-sm leading-5 text-muted">
          {workouts.length} workouts · {bodyweight.length} weigh-ins · {customExercises.length} custom exercises ·{' '}
          {plans.length} plan{plans.length === 1 ? '' : 's'}. Everything lives in this browser (localStorage, key{' '}
          <span className="font-mono text-zinc-300">gynproxd-v2</span>).
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportJson}>Export JSON</Button>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-line bg-card px-4 py-2.5 text-sm font-semibold text-zinc-100 transition-colors hover:border-line-strong hover:bg-card-hover focus-visible:outline-none">
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
        {msg && <p className="mt-3 rounded-[var(--radius-md)] bg-accent-soft px-3 py-2 text-sm font-medium text-accent">{msg}</p>}
      </Card>

      <Card className="border-dashed bg-transparent shadow-none">
        <h3 className="text-sm font-semibold text-zinc-300">About</h3>
        <p className="mt-1 text-sm leading-5 text-muted">
          GynProXD v0.1.0 — local-first gym tracker. Clean-room rebuild, public-domain exercise data, images via jsDelivr CDN only.
        </p>
        <p className="mt-3 text-xs text-zinc-500">No copy of openGym code/UI strings/CSS/GIFs. Media stays public-domain/CDN.</p>
      </Card>
    </div>
  )
}
