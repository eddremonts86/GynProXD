import { useState } from 'react'
import { useGym } from '../store/useGym'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { Illustration } from '../ui/Illustration'
import { InstallAppButton } from '@/components/install-app-button'

export function SettingsPage() {
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const customExercises = useGym((s) => s.customExercises)
  const plans = useGym((s) => s.plans)
  const importData = useGym((s) => s.importData)
  const clearAllData = useGym((s) => s.clearAllData)
  const [msg, setMsg] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)

  const hasData = workouts.length > 0 || bodyweight.length > 0 || customExercises.length > 0 || plans.length > 0

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 3, customExercises, workouts, bodyweight, plans }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `forma-export-${new Date().toISOString().slice(0, 10)}.json`
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
      <PageHeader eyebrow="Forma · Settings" title="Local-first" description="No cloud, no account. PWA offline, data in your browser." />

      <Illustration variant="plate" className="h-20 w-full" />

      <Card>
        <h2 className="font-display text-lg text-ink">Your data</h2>
        <p className="mt-1 text-sm leading-5 text-muted">
          {workouts.length} sessions · {bodyweight.length} weigh-ins · {customExercises.length} custom · {plans.length} plan
          {plans.length === 1 ? '' : 's'}. Stored in <span className="font-mono text-xs tracking-wide text-ink-soft">gynproxd-v2</span> (localStorage), warm and offline.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={exportJson}>Export JSON</Button>
          <InstallAppButton />
          <label className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-line bg-card px-4 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-line-strong hover:bg-card-hover focus-visible:outline-none">
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
        {msg && <p className="mt-3 rounded-[var(--radius-md)] bg-accent-soft px-3 py-2 text-sm font-medium text-accent border border-accent/20">{msg}</p>}
        <p className="mt-3 text-xs leading-4 text-muted">Includes 873 public-domain movements via jsDelivr, your customs, and weekly plans. No server.</p>
        <p className="mt-2 text-xs leading-4 text-muted">
          Exercise data by <a href="https://repdb.co/free-exercise-dataset" target="_blank" rel="noreferrer" className="underline text-accent">RepDB (repdb.co)</a> — 250 flat WebP (free tier, attribution) + generated flat SVG. Images in <span className="font-mono">public/repdb</span> and <span className="font-mono">public/generated</span> cached offline.
        </p>
      </Card>

      <Card className="border-destructive/30">
        <h2 className="font-display text-lg text-ink">Danger zone</h2>
        <p className="mt-1 text-sm leading-5 text-muted">
          Deletes sessions, weigh-ins, custom movements, weekly plans and generated plans from this browser. Export first if you want a backup — this cannot be undone.
        </p>
        {confirmClear ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-destructive">¿Seguro? Se borra todo.</span>
            <Button variant="ghost" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => { clearAllData(); setConfirmClear(false); setMsg('All data cleared.') }}>
              Yes, delete everything
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasData}
            onClick={() => setConfirmClear(true)}
            className="mt-4 border border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            Clear all data
          </Button>
        )}
      </Card>

      <Card className="border-dashed bg-transparent shadow-none">
        <h3 className="font-display text-lg text-ink">Forma</h3>
        <p className="mt-1 font-mono text-xs tracking-widest text-accent uppercase">Noir Warm · 3D plate · editorial human</p>
        <p className="mt-3 text-sm leading-5 text-muted">
          Hybrid calisthenics + gym, local-first. Forma evolved from GynProXD — same clean-room rebuild, now warm editorial. No copy of openGym code/UI/CSS/GIFs. Images via jsDelivr CDN only, offline cached by Workbox.
        </p>
        <p className="mt-3 text-xs leading-4 text-muted">
          Strava/Whoop/Hevy inspired data, but human — Stone & Clay, amber, serif headlines, soft plates. PWA standalone, theme #1A1816.
        </p>
      </Card>
    </div>
  )
}
