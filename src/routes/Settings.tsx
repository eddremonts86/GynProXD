import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DownloadSimple, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { PageHeader, Section } from '../ui/PageHeader'
import { InstallAppButton } from '@/components/install-app-button'
import { pluralize } from '../lib/labels'
import { todayIso } from '../lib/dates'

type Feedback = { tone: 'good' | 'danger'; text: string } | null

export function SettingsPage() {
  const navigate = useNavigate()
  const workouts = useGym((s) => s.workouts)
  const bodyweight = useGym((s) => s.bodyweight)
  const customExercises = useGym((s) => s.customExercises)
  const plans = useGym((s) => s.plans)
  const generatedPlans = useGym((s) => s.generatedPlans)
  const importData = useGym((s) => s.importData)
  const clearAllData = useGym((s) => s.clearAllData)

  const fileRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const hasData =
    workouts.length > 0 ||
    bodyweight.length > 0 ||
    customExercises.length > 0 ||
    plans.length > 0 ||
    generatedPlans.length > 0

  const exportJson = () => {
    const payload = {
      version: 3,
      exportedAt: new Date().toISOString(),
      customExercises,
      workouts,
      bodyweight,
      plans,
      generatedPlans,
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = `forma-${todayIso()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setFeedback({ tone: 'good', text: 'Export downloaded.' })
  }

  const importJson = async (file: File) => {
    try {
      const ok = importData(JSON.parse(await file.text()))
      setFeedback(
        ok
          ? { tone: 'good', text: 'Import complete.' }
          : { tone: 'danger', text: 'That file is not a Forma export.' },
      )
    } catch {
      setFeedback({ tone: 'danger', text: 'That file could not be read as JSON.' })
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Forma runs entirely in this browser. There is no account and nothing is uploaded."
      />

      <Section title="Your data" hint={`${pluralize(workouts.length, 'session')} stored`}>
        <Panel padding="lg" className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ['Sessions', workouts.length],
              ['Weigh-ins', bodyweight.length],
              ['Custom movements', customExercises.length],
              ['Weekly plans', plans.length],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-col gap-0.5">
                <dt className="text-2xs text-ink-3">{label}</dt>
                <dd className="num text-xl font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Button onClick={exportJson}>
              <DownloadSimple size={16} />
              Export a backup
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <UploadSimple size={16} />
              Restore from file
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void importJson(file)
                e.target.value = ''
              }}
            />
            <InstallAppButton />
          </div>

          {feedback && (
            <p
              role="status"
              className={
                feedback.tone === 'good'
                  ? 'rounded-md bg-good-soft px-3 py-2 text-sm text-good'
                  : 'rounded-md bg-danger-soft px-3 py-2 text-sm text-danger'
              }
            >
              {feedback.text}
            </p>
          )}

          <p className="text-2xs text-ink-3">
            Restoring replaces everything currently stored. Export first if you want to keep it.
          </p>
        </Panel>
      </Section>

      <Section title="Plan">
        <Panel padding="lg" className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[46ch] text-sm text-ink-3">
            Circumstances change. Run the planner again to recalculate the timeline from your
            current weight and the time you have now.
          </p>
          <Button variant="secondary" onClick={() => navigate({ to: '/onboarding' })}>
            Rebuild my plan
          </Button>
        </Panel>
      </Section>

      <Section title="Delete everything">
        <Panel padding="lg" className="flex flex-col gap-4 border-danger/30">
          <div className="flex gap-3">
            <WarningCircle size={20} className="mt-0.5 shrink-0 text-danger" />
            <p className="max-w-[52ch] text-sm text-ink-2">
              This removes every session, weigh-in, custom movement and plan from this browser.
              There is no server copy, so it cannot be undone.
            </p>
          </div>
          {confirmClear ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  clearAllData()
                  setConfirmClear(false)
                  setFeedback({ tone: 'good', text: 'All data deleted.' })
                }}
              >
                Yes, delete everything
              </Button>
            </div>
          ) : (
            <div>
              <Button variant="dangerQuiet" disabled={!hasData} onClick={() => setConfirmClear(true)}>
                Delete all data
              </Button>
            </div>
          )}
        </Panel>
      </Section>

      <Section title="About">
        <div className="flex flex-col gap-3 text-sm text-ink-3">
          <p className="max-w-[62ch]">
            Forma plans, guides and records hybrid calisthenics and barbell training. It works
            offline once installed, and your training data never leaves this device.
          </p>
          <p className="max-w-[62ch] text-2xs">
            Names, muscles, instructions and photographs from{' '}
            <a
              href="https://github.com/yuhonas/free-exercise-db"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              free-exercise-db
            </a>{' '}
            (public domain). Offline fallback illustrations from{' '}
            <a
              href="https://repdb.co/free-exercise-dataset"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              RepDB
            </a>{' '}
            under its free-tier attribution licence.
          </p>
          <p className="max-w-[62ch] text-2xs">
            Forma is not medical advice. Talk to a professional before changing how you train or
            eat, especially if you have an existing condition.
          </p>
        </div>
      </Section>
    </div>
  )
}
