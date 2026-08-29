import { useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { DownloadSimple, UploadSimple, WarningCircle } from '@phosphor-icons/react'
import { useGym } from '../store/useGym'
import { useRecipes } from '../store/useRecipes'
import { useSession } from '../store/useSession'
import {
  activeProfile,
  deleteActiveProfile,
  listGyms,
  lockProfile,
  updateProfileMeta,
} from '../lib/profiles'
import type { ProfileDetails } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Button } from '../ui/Button'
import { Combobox } from '../ui/Combobox'
import { FormSelect } from '../ui/FormSelect'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'
import { PageHeader, Section } from '../ui/PageHeader'
import { Tabs, TabPanel } from '../ui/Tabs'
import { Collapse } from '../ui/Collapse'
import { InstallAppButton } from '@/components/install-app-button'
import { SyncSection } from '@/components/sync-section'
import { GymMembership } from '@/components/gym-membership'
import { SEX_LABELS } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { Switch } from '@/components/ui/switch'
import {
  disablePush,
  enablePush,
  needsHomeScreenForPush,
  notificationPermission,
  notificationsSupported,
  notificationsWanted,
  pushEnabled,
  pushSupported,
  requestNotificationPermission,
  setNotificationPref,
  type NotifyChannel,
} from '../lib/notify'
import { readSyncLink } from '../lib/sync'

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
  const clearSuggestions = useRecipes((s) => s.clearSuggestions)

  const profileName = useSession((s) => s.profileName)
  const setLocked = useSession((s) => s.setLocked)
  const fileRef = useRef<HTMLInputElement>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDeleteProfile, setConfirmDeleteProfile] = useState(false)
  const [tab, setTab] = useState('profile')

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
    a.download = `enforma-${todayIso()}.json`
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
          : { tone: 'danger', text: 'That file is not an enForma export.' },
      )
    } catch {
      setFeedback({ tone: 'danger', text: 'That file could not be read as JSON.' })
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="Profiles are encrypted on this device. Nothing leaves it unless you turn on sync, and even then the server only ever holds sealed rows."
      />

      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: 'profile', label: 'Profile' },
          { value: 'device', label: 'Device' },
          { value: 'data', label: 'Data', count: workouts.length },
          { value: 'about', label: 'About' },
        ]}
      >
        <TabPanel value="profile" className="flex flex-col gap-3">
        <ProfileIdentityPanel />
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

        <GymMembership />

        <Panel padding="lg" className="flex flex-wrap items-center justify-between gap-4">
          <p className="max-w-[46ch] text-sm text-ink-3">
            Circumstances change. Design a new programme from your current weight and the time
            you have now; the timeline is recalculated on the way.
          </p>
          <Button variant="secondary" onClick={() => navigate({ to: '/onboarding' })}>
            Design my programme
          </Button>
        </Panel>
        </TabPanel>

        <TabPanel value="device" className="flex flex-col gap-8">
          {/* Managing OTHER profiles is the device admin's job and lives in
              /admin, role-gated. A member's Settings only ever touches their
              own profile — anything wider was a cross-user privilege leak. */}
          <NotificationsSection />
        </TabPanel>

        <TabPanel value="data" className="flex flex-col gap-3">
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

        <SyncSection />

        <Panel padding="lg">
        <Collapse header={<span className="text-danger">Danger zone</span>}>
        <div className="flex flex-col gap-4 pt-1">
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
                  clearSuggestions()
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
        </div>
        </Collapse>
        </Panel>
        </TabPanel>

        <TabPanel value="about">
        <div className="flex flex-col gap-3 text-sm text-ink-3">
          <p className="max-w-[62ch]">
            enForma plans, guides and records hybrid calisthenics and barbell training. It works
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
            The dish of the day, with its photo, comes from{' '}
            <a
              href="https://www.themealdb.com"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              TheMealDB
            </a>
            . Meal suggestions, their nutrition numbers and photos come from the{' '}
            <a
              href="https://spoonacular.com/food-api"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              spoonacular API
            </a>
            .
          </p>
          <p className="max-w-[62ch] text-2xs">
            enForma is not medical advice. Talk to a professional before changing how you train or
            eat, especially if you have an existing condition.
          </p>
        </div>
        </TabPanel>
      </Tabs>
    </div>
  )
}

/**
 * The person behind the profile. Name and gym live in the plaintext registry
 * (the lock screen shows them); age, sex and height are encrypted with the
 * rest of the data and prefill the programme designer.
 */
function ProfileIdentityPanel() {
  const details = useGym((s) => s.profileDetails)
  const setProfileDetails = useGym((s) => s.setProfileDetails)
  const refreshMeta = useSession((s) => s.refreshMeta)
  const [meta] = useState(activeProfile)
  const [gyms] = useState(listGyms)

  const [name, setName] = useState(meta?.name ?? '')
  const [gym, setGym] = useState(meta?.gym ?? '')
  const [age, setAge] = useState(details?.age ? String(details.age) : '')
  const [sex, setSex] = useState<'hombre' | 'mujer' | 'otro' | ''>(details?.sex ?? '')
  const [height, setHeight] = useState(details?.heightCm ? String(details.heightCm) : '')
  const [saved, setSaved] = useState(false)

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setSaved(false)
  }

  const save = () => {
    const trimmedName = name.trim()
    if (meta && trimmedName) {
      updateProfileMeta(meta.id, { name: trimmedName, gym })
      refreshMeta({ name: trimmedName, gym })
    }
    const next: ProfileDetails = {}
    const ageN = Math.round(Number(age))
    if (age.trim() && Number.isFinite(ageN) && ageN > 0) next.age = ageN
    if (sex) next.sex = sex
    const heightN = Math.round(Number(height))
    if (height.trim() && Number.isFinite(heightN) && heightN > 0) next.heightCm = heightN
    setProfileDetails(Object.keys(next).length > 0 ? next : null)
    setSaved(true)
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={name || (meta?.name ?? '?')} seed={meta?.id ?? name} size="lg" />
        <p className="max-w-[46ch] text-2xs text-ink-3">
          Name and gym appear on the lock screen. Age, sex and height are encrypted with your
          training data and prefill the programme designer.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Name" value={name} onChange={(e) => touch(setName)(e.target.value)} />
        <Combobox
          label="Gym"
          value={gym}
          onValueChange={touch(setGym)}
          options={gyms}
          placeholder="Search or add yours"
          createLabel="Add gym"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input
          label="Age"
          value={age}
          onChange={(e) => touch(setAge)(e.target.value)}
          inputMode="numeric"
          placeholder="—"
        />
        <FormSelect
          label="Sex"
          value={sex}
          onValueChange={(v) => touch(setSex)(v as typeof sex)}
          placeholder="—"
          options={(['hombre', 'mujer', 'otro'] as const).map((v) => ({
            value: v,
            label: SEX_LABELS[v],
          }))}
        />
        <Input
          label="Height"
          value={height}
          onChange={(e) => touch(setHeight)(e.target.value)}
          inputMode="numeric"
          suffix="cm"
          placeholder="—"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!name.trim()}>
          Save details
        </Button>
        {saved && (
          <span role="status" className="text-2xs text-good">
            Saved.
          </span>
        )}
      </div>

      {/* Two things people only discover once it is too late: that no gym
          means no announcements, and that the only copy of this profile is
          the one on this device. */}
      <div className="flex flex-col gap-1.5 border-t border-line pt-4">
        {!gym.trim() && (
          <p className="text-2xs text-ink-3">
            You are not linked to a gym, so no announcements, menus or challenges reach you. Pick
            one above to start receiving them.
          </p>
        )}
        <p className="text-2xs text-ink-3">
          This profile lives only on this device and a forgotten passphrase cannot be recovered.
          Keep a copy under <span className="font-semibold text-ink-2">Data → Export a backup</span>.
        </p>
      </div>
    </Panel>
  )
}

/** System notifications, honest about their local reach. */
function NotificationsSection() {
  if (!notificationsSupported()) return null

  return (
    <Section title="Notifications">
      <Panel padding="none" className="divide-y divide-line">
        <NotificationPermissionRow />
        <NotificationToggle
          channel="gym"
          title="Gym messages"
          description="A system notification when your gym sends something new, shown while enForma is open on this device."
        />
        <PushToggle />
        <NotificationToggle
          channel="training"
          title="Training nudges"
          description="A reminder when your fitness test is eight weeks old, checked when you unlock this profile."
        />
      </Panel>
    </Section>
  )
}

/**
 * Browser permission is the one thing an app cannot switch on for you. The
 * channels below default to on, so this asks for the grant that lets them
 * actually deliver — once, without an unprompted popup. It disappears the
 * moment permission is granted.
 */
function NotificationPermissionRow() {
  const [permission, setPermission] = useState<NotificationPermission>(() => notificationPermission())
  if (permission === 'granted') return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">Allow notifications</span>
        <span className="max-w-[52ch] text-2xs text-ink-3">
          {permission === 'denied'
            ? 'Your browser has blocked notifications for enForma. Allow them in the site settings to receive the reminders below.'
            : 'The reminders below are on by default — let your browser deliver them.'}
        </span>
      </div>
      {permission === 'default' && (
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            void requestNotificationPermission().then(() => setPermission(notificationPermission()))
          }
        >
          Allow
        </Button>
      )}
    </div>
  )
}

/**
 * Real Web Push: the gym's messages reach this device with the app closed.
 * Shown only when it can actually work — a linked profile in a browser that
 * has a push manager — and honest about the iOS install requirement.
 */
function PushToggle() {
  const profileId = activeProfile()?.id ?? null
  const [enabled, setEnabled] = useState(() => (profileId ? pushEnabled(profileId) : false))
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!profileId || !pushSupported() || !readSyncLink(profileId)) return null
  const iosHint = needsHomeScreenForPush()

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">Gym messages while the app is closed</span>
        <span className="max-w-[52ch] text-2xs text-ink-3">
          {note ??
            (iosHint
              ? 'On iPhone, install enForma first: Share → Add to Home Screen. iOS only delivers push to installed apps.'
              : 'Delivered through your sync account to this device, even with enForma closed.')}
        </span>
      </div>
      <Switch
        aria-label="Push gym messages to this device"
        checked={enabled}
        disabled={busy}
        onCheckedChange={(on) => {
          setNote(null)
          if (!on) {
            setBusy(true)
            void disablePush(profileId).finally(() => {
              setEnabled(false)
              setBusy(false)
            })
            return
          }
          setBusy(true)
          void enablePush(profileId)
            .then((result) => {
              setEnabled(result.ok)
              if (!result.ok) setNote(result.message)
            })
            .finally(() => setBusy(false))
        }}
      />
    </div>
  )
}

function NotificationToggle({
  channel,
  title,
  description,
}: {
  channel: NotifyChannel
  title: string
  description: string
}) {
  /* The toggle is the preference (opt-out, on by default); browser permission
     is the separate concern the row above handles. */
  const [enabled, setEnabled] = useState(() => notificationsWanted(channel))

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-semibold text-ink">{title}</span>
        <span className="max-w-[52ch] text-2xs text-ink-3">{description}</span>
      </div>
      <Switch
        aria-label={`Notify about ${title.toLowerCase()}`}
        checked={enabled}
        onCheckedChange={(on) => {
          setEnabled(on)
          setNotificationPref(channel, on)
        }}
      />
    </div>
  )
}

