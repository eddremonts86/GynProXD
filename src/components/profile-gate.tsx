import { useState } from 'react'
import { ArrowRight, CircleNotch, Plus } from '@phosphor-icons/react'
import { Wordmark } from '@/components/brand'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Combobox } from '@/ui/Combobox'
import { FormSelect } from '@/ui/FormSelect'
import { Input } from '@/ui/Input'
import {
  createProfile,
  lastActiveProfileId,
  legacySnapshot,
  listGyms,
  listProfiles,
  unlockProfile,
  type ProfileRole,
} from '@/lib/profiles'
import { formatShortDate } from '@/lib/labels'
import { cn } from '@/lib/utils'

/**
 * The lock screen. Every profile's data is encrypted under its passphrase, so
 * this is not a formality: without the phrase there is nothing to show.
 */
export function ProfileGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [profiles] = useState(listProfiles)
  const [mode, setMode] = useState<'unlock' | 'create'>(profiles.length > 0 ? 'unlock' : 'create')
  const [selectedId, setSelectedId] = useState<string>(
    () => lastActiveProfileId() ?? profiles[0]?.id ?? '',
  )
  const [passphrase, setPassphrase] = useState('')
  const [name, setName] = useState('')
  const [gym, setGym] = useState('')
  const [gyms] = useState(listGyms)
  const [role, setRole] = useState<ProfileRole>('member')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /* Only offered while no profile exists yet: data from before profiles. */
  const hasLegacy = profiles.length === 0 && legacySnapshot() !== null

  const unlock = async () => {
    if (busy || !selectedId) return
    setBusy(true)
    setError(null)
    try {
      const ok = await unlockProfile(selectedId, passphrase)
      if (!ok) {
        setError('That passphrase does not open this profile.')
        return
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setError('Give the profile a name.')
      return
    }
    if (role === 'gym' && gym.trim().length === 0) {
      setError('A gym profile needs the name of the gym it runs.')
      return
    }
    if (passphrase.length < 4) {
      setError('The passphrase needs at least 4 characters.')
      return
    }
    if (passphrase !== confirm) {
      setError('The passphrases do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createProfile(trimmed, passphrase, { importLegacy: hasLegacy, gym, role })
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-8 bg-bg px-4 py-10">
      <Wordmark />

      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-[var(--shadow-tile)]">
        {mode === 'unlock' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void unlock()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <h1 className="text-xl text-ink">Who is training?</h1>
              <p className="text-2xs text-ink-3">
                Each profile is encrypted with its own passphrase.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(p.id)
                    setError(null)
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-left transition-colors',
                    selectedId === p.id ? 'ring-2 ring-brand' : 'hover:bg-line/60',
                  )}
                >
                  <Avatar name={p.name} seed={p.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-2xs text-ink-3">
                      {p.gym ? `${p.gym} · ` : ''}
                      <span className="num">since {formatShortDate(p.createdAt.slice(0, 10))}</span>
                    </span>
                  </span>
                </button>
              ))}
            </div>

            <Input
              label="Passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value)
                setError(null)
              }}
              error={error ?? undefined}
              autoFocus
            />

            <Button type="submit" size="lg" disabled={busy || !passphrase} className="w-full">
              {busy ? (
                <CircleNotch size={18} weight="bold" className="animate-spin" />
              ) : (
                <>
                  Unlock
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => {
                setMode('create')
                setError(null)
              }}
            >
              <Plus size={14} weight="bold" />
              New profile
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <h1 className="text-xl text-ink">Create your profile</h1>
              <p className="text-2xs text-ink-3">
                Your training data is encrypted with this passphrase and never leaves the device.
                There is no reset: write it down, and export backups from Settings.
              </p>
            </div>

            <Input
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              autoFocus
            />
            <FormSelect
              label="Profile type"
              value={role}
              onValueChange={(v) => {
                setRole(v as ProfileRole)
                setError(null)
              }}
              options={[
                { value: 'member', label: 'Member — I train here' },
                { value: 'gym', label: 'Gym — I run a gym' },
                { value: 'admin', label: 'Administrator — I manage this device' },
              ]}
            />
            {role !== 'admin' && (
              <Combobox
                label="Gym"
                value={gym}
                onValueChange={(v) => {
                  setGym(v)
                  setError(null)
                }}
                options={gyms}
                placeholder="Search or add yours"
                createLabel="Add gym"
                hint={
                  role === 'gym'
                    ? 'The gym this profile runs. Members who pick it become your audience.'
                    : 'Leave empty if you train on your own.'
                }
              />
            )}
            <Input
              label="Passphrase"
              type="password"
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value)
                setError(null)
              }}
              hint="At least 4 characters."
            />
            <Input
              label="Repeat passphrase"
              type="password"
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError(null)
              }}
              error={error ?? undefined}
            />

            {hasLegacy && (
              <p className="rounded-md bg-surface-2 p-3 text-2xs leading-relaxed text-ink-2">
                Training data from before profiles existed was found on this device. It will be
                moved into this profile and encrypted.
              </p>
            )}

            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? (
                <CircleNotch size={18} weight="bold" className="animate-spin" />
              ) : (
                'Create profile'
              )}
            </Button>

            {profiles.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="self-center"
                onClick={() => {
                  setMode('unlock')
                  setError(null)
                }}
              >
                Back to profiles
              </Button>
            )}
          </form>
        )}
      </div>

      <p className="max-w-sm text-center text-2xs text-ink-3">
        Local only. No cloud. A forgotten passphrase cannot be recovered.
      </p>
    </div>
  )
}
