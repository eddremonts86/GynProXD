import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DownloadSimple, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { useSession } from '../store/useSession'
import { deleteActiveProfile, lockProfile } from '../lib/profiles'
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

  const profileName = useSession((s) => s.profileName)
  const setLocked = useSession((s) => s.setLocked)
  const fileRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false)

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
        description="Forma runs entirely in this browser. Profiles are encrypted locally and nothing is uploaded."
      />

      <Section title="Profile">
        <Panel padding="lg" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-ink">{profileName}</span>
              <span className="text-2xs text-ink-3">
                This profile's data is encrypted with its passphrase. Locking returns to the
                profile screen.
              </span>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                void lockProfile().then(setLocked)
              }}
            >
              Lock profile
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="max-w-[46ch] text-2xs text-ink-3">
              Deleting removes this profile and every byte of its encrypted data from the device.
              Export a backup first.
            </p>
            {confirmDeleteProfile ? (
              <span className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteProfile(false)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    void deleteActiveProfile().then(setLocked)
                  }}
                >
                  Delete profile
                </Button>
              </span>
            ) : (
              <Button variant="dangerQuiet" size="sm" onClick={() => setConfirmDeleteProfile(true)}>
                Delete profile
              </Button>
            )}
          </div>
        </Panel>
      </Section>

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

      <Section title="Programme">
        <Panel padding="lg" className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[46ch] text-sm text-ink-3">
            Circumstances change. Design a new programme from your current weight and the time
            you have now; the timeline is recalculated on the way.
          </p>
          <Button variant="secondary" onClick={() => navigate({ to: '/onboarding' })}>
            Design my programme
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
