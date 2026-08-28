import { useState } from 'react'
import { ArrowRight, CircleNotch, CloudCheck, Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { Wordmark } from '@/components/brand'
import { Avatar } from '@/ui/Avatar'
import { Button, IconButton } from '@/ui/Button'
import { Combobox } from '@/ui/Combobox'
import { Input } from '@/ui/Input'
import { Tag } from '@/ui/Tag'
import {
  createProfile,
  lastActiveProfileId,
  legacySnapshot,
  listGyms,
  listProfiles,
  unlockProfile,
  type ProfileRole,
} from '@/lib/profiles'
import { signInFromGate } from '@/lib/sync'
import { formatShortDate } from '@/lib/labels'
import { cn } from '@/lib/utils'

/**
 * The lock screen. Every profile's data is encrypted under its passphrase, so
 * this is not a formality: without the phrase there is nothing to show.
 * Validation anchors to the failing field and moves focus there — a form
 * that points at the wrong field teaches people to distrust it.
 */

type ErrorField = 'unlock' | 'name' | 'gym' | 'pass' | 'confirm' | 'email' | 'apass' | 'signin'
interface GateError {
  field: ErrorField
  text: string
}

const ROLE_TAGS: Partial<Record<ProfileRole, string>> = { gym: 'Gym', admin: 'Admin' }

function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <IconButton
      type="button"
      size="sm"
      aria-label={shown ? 'Hide passphrase' : 'Show passphrase'}
      onClick={onToggle}
    >
      {shown ? <EyeSlash size={16} /> : <Eye size={16} />}
    </IconButton>
  )
}

export function ProfileGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [profiles] = useState(listProfiles)
  const [mode, setMode] = useState<'unlock' | 'create' | 'signin'>(
    profiles.length > 0 ? 'unlock' : 'create',
  )
  const [email, setEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [selectedId, setSelectedId] = useState<string>(
    () => lastActiveProfileId() ?? profiles[0]?.id ?? '',
  )
  const [passphrase, setPassphrase] = useState('')
  const [name, setName] = useState('')
  const [gym, setGym] = useState('')
  const [gyms] = useState(listGyms)
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<GateError | null>(null)
  const [showPass, setShowPass] = useState(false)
  const [busy, setBusy] = useState(false)

  const errorFor = (field: ErrorField) => (error?.field === field ? error.text : undefined)
  const failWith = (field: ErrorField, text: string, focusId?: string) => {
    setError({ field, text })
    if (focusId) document.getElementById(focusId)?.focus()
  }

  /* Only offered while no profile exists yet: data from before profiles. */
  const hasLegacy = profiles.length === 0 && legacySnapshot() !== null

  const unlock = async () => {
    if (busy || !selectedId) return
    setBusy(true)
    setError(null)
    try {
      const ok = await unlockProfile(selectedId, passphrase)
      if (!ok) {
        failWith('unlock', 'That passphrase does not open this profile.', 'f-passphrase')
        return
      }
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  const signIn = async () => {
    if (busy) return
    if (name.trim().length === 0) {
      failWith('name', 'Give this device a profile name.', 'f-name')
      return
    }
    if (email.trim().length === 0) {
      failWith('email', 'The account email is needed to sign in.', 'f-email')
      return
    }
    if (accountPassword.length === 0) {
      failWith('apass', 'The account password is needed to sign in.', 'f-account-password')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signInFromGate({
        name,
        email: email.trim(),
        password: accountPassword,
      })
      onUnlocked()
    } catch (err) {
      failWith('signin', err instanceof Error ? err.message : 'Signing in failed.')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      failWith('name', 'Give the profile a name.', 'f-name')
      return
    }
    if (passphrase.length < 4) {
      failWith('pass', 'The passphrase needs at least 4 characters.', 'f-passphrase')
      return
    }
    if (passphrase !== confirm) {
      failWith('confirm', 'The passphrases do not match.', 'f-repeat-passphrase')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await createProfile(trimmed, passphrase, { importLegacy: hasLegacy, gym })
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
                    document.getElementById('f-passphrase')?.focus()
                  }}
                  className={cn(
                    'flex items-center gap-3 rounded-lg bg-surface-2 p-3 text-left transition-colors',
                    selectedId === p.id ? 'ring-2 ring-brand' : 'hover:bg-line/60',
                  )}
                >
                  <Avatar name={p.name} seed={p.id} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                      {ROLE_TAGS[p.role] && <Tag tone="outline">{ROLE_TAGS[p.role]}</Tag>}
                    </span>
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
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value)
                setError(null)
              }}
              error={errorFor('unlock')}
              trailing={<RevealToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />}
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

            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('create')
                  setError(null)
                  setShowPass(false)
                  setPassphrase('')
                }}
              >
                <Plus size={14} weight="bold" />
                New profile
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setShowPass(false)
                  setPassphrase('')
                }}
              >
                <CloudCheck size={14} weight="bold" />
                Sign in to sync
              </Button>
            </div>
          </form>
        ) : mode === 'signin' ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void signIn()
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <h1 className="text-xl text-ink">Sign in to sync</h1>
              <p className="text-2xs text-ink-3">
                Your training pulls onto this device. One password signs you in and decrypts it —
                the server only ever holds sealed rows.
              </p>
            </div>

            <Input
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              error={errorFor('name')}
              hint="How this profile appears on this device's lock screen."
              autoFocus
            />
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError(null)
              }}
              error={errorFor('email')}
            />
            <Input
              label="Account password"
              type={showPass ? 'text' : 'password'}
              value={accountPassword}
              onChange={(e) => {
                setAccountPassword(e.target.value)
                setError(null)
              }}
              error={errorFor('apass') ?? errorFor('signin')}
              trailing={<RevealToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />}
            />

            <Button type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? (
                <CircleNotch size={18} weight="bold" className="animate-spin" />
              ) : (
                <>
                  Sign in and pull my training
                  <ArrowRight size={18} weight="bold" />
                </>
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              onClick={() => {
                setMode(profiles.length > 0 ? 'unlock' : 'create')
                setError(null)
                setShowPass(false)
                setPassphrase('')
                setAccountPassword('')
              }}
            >
              Back
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
                Your training data is encrypted with this passphrase. There is no reset: write it
                down, and export backups from Settings.
              </p>
              {profiles.length === 0 && (
                <p className="text-2xs text-ink-3">
                  The first profile on a device is its administrator.
                </p>
              )}
            </div>

            <Input
              label="Name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              error={errorFor('name')}
              autoFocus
            />
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
              error={errorFor('gym')}
              hint="Leave empty if you train on your own."
            />
            <Input
              label="Passphrase"
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => {
                setPassphrase(e.target.value)
                setError(null)
              }}
              error={errorFor('pass')}
              hint="At least 4 characters. There is no way to recover it."
              trailing={<RevealToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />}
            />
            <Input
              label="Repeat passphrase"
              type={showPass ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => {
                setConfirm(e.target.value)
                setError(null)
              }}
              error={errorFor('confirm')}
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

            <div className="flex flex-wrap items-center justify-center gap-2">
              {profiles.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMode('unlock')
                    setError(null)
                    setShowPass(false)
                    setPassphrase('')
                    setConfirm('')
                  }}
                >
                  Back to profiles
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMode('signin')
                  setError(null)
                  setShowPass(false)
                  setPassphrase('')
                  setConfirm('')
                }}
              >
                <CloudCheck size={14} weight="bold" />
                Sign in to sync
              </Button>
            </div>
          </form>
        )}
      </div>

      <p className="max-w-sm text-center text-2xs text-ink-3">
        Local first: nothing leaves this device unless you turn on sync in Settings. A forgotten
        passphrase cannot be recovered.
      </p>
    </div>
  )
}
