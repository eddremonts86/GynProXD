import { useState } from 'react'
import { ArrowRight, CircleNotch, CloudCheck, Eye, EyeSlash, Plus } from '@phosphor-icons/react'
import { Avatar } from '@/ui/Avatar'
import { Button, IconButton } from '@/ui/Button'
import { Combobox } from '@/ui/Combobox'
import { FormSelect } from '@/ui/FormSelect'
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
import { requestPasswordReset, resetPasswordFromGate, signInFromGate } from '@/lib/sync'
import { SEX_LABELS, formatShortDate } from '@/lib/labels'
import type { ProfileDetails } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * The door. Every profile's data is encrypted under its passphrase, so this is
 * not a formality: without the phrase there is nothing to show. Validation
 * anchors to the failing field and moves focus there — a form that points at
 * the wrong field teaches people to distrust it.
 *
 * The landing page mounts this twice, once beside the hero and once further
 * down the page, so `idPrefix` namespaces every field. Two mounts keep two
 * independent drafts on purpose: whichever one you finish is the one that
 * opens the app.
 */

type Mode = 'unlock' | 'create' | 'signin' | 'reset'

type ErrorField =
  | 'unlock'
  | 'name'
  | 'gym'
  | 'pass'
  | 'confirm'
  | 'email'
  | 'apass'
  | 'signin'
  | 'token'
  | 'recovery'

interface GateError {
  field: ErrorField
  text: string
}

/** Rows the gate shows before it collapses the rest. */
const PROFILE_PREVIEW = 2

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

interface AuthPanelProps {
  /** Namespaces every field id so the panel can be mounted more than once. */
  idPrefix: string
  onUnlocked: () => void
  /** Overrides the default (profiles on this device -> unlock, none -> create). */
  initialMode?: Mode
  /**
   * Carries the accent edge. Off by default because the landing mounts this
   * twice and only one of them is ever alone on screen: the second sits a few
   * hundred pixels under the comparison card, which already has the accent, and
   * two of them in one viewport is one too many.
   */
  accent?: boolean
  className?: string
}

export function AuthPanel({
  idPrefix,
  onUnlocked,
  initialMode,
  accent = false,
  className,
}: AuthPanelProps) {
  /**
   * Last used first, so the one somebody is about to unlock is the one they can
   * see without opening anything.
   */
  const [profiles] = useState(() => {
    const all = listProfiles()
    const last = lastActiveProfileId()
    const first = all.findIndex((p) => p.id === last)
    return first > 0 ? [all[first], ...all.filter((_, i) => i !== first)] : all
  })
  const [mode, setMode] = useState<Mode>(
    initialMode ?? (profiles.length > 0 ? 'unlock' : 'create'),
  )
  const [email, setEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request')
  const [resetToken, setResetToken] = useState('')
  const [recovery, setRecovery] = useState('')
  const [selectedId, setSelectedId] = useState<string>(
    () => lastActiveProfileId() ?? profiles[0]?.id ?? '',
  )
  const [passphrase, setPassphrase] = useState('')
  const [name, setName] = useState('')
  const [gym, setGym] = useState('')
  const [gyms] = useState(listGyms)
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<'hombre' | 'mujer' | 'otro' | ''>('')
  const [height, setHeight] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<GateError | null>(null)
  const [showPass, setShowPass] = useState(false)
  /**
   * How many profiles the gate shows before it stops being a door.
   *
   * Seven of them turned the panel into a wall of near-identical rows with the
   * passphrase field pushed off the bottom. Two is enough to say "pick one" and
   * to hold the one you last used, which is first in the list — so the
   * selection is always visible without expanding anything.
   */
  const [showAllProfiles, setShowAllProfiles] = useState(false)
  const [busy, setBusy] = useState(false)

  const fid = (suffix: string) => `${idPrefix}-${suffix}`
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
        failWith('unlock', 'That passphrase does not open this profile.', fid('passphrase'))
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
      failWith('name', 'Give this device a profile name.', fid('name'))
      return
    }
    if (email.trim().length === 0) {
      failWith('email', 'The account email is needed to sign in.', fid('email'))
      return
    }
    if (accountPassword.length === 0) {
      failWith('apass', 'The account password is needed to sign in.', fid('account-password'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await signInFromGate({ name, email: email.trim(), password: accountPassword })
      onUnlocked()
    } catch (err) {
      failWith('signin', err instanceof Error ? err.message : 'Signing in failed.')
    } finally {
      setBusy(false)
    }
  }

  const requestReset = async () => {
    if (busy) return
    if (email.trim().length === 0) {
      failWith('email', 'The account email is where the reset code goes.', fid('email'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await requestPasswordReset(email)
      setResetStep('confirm')
    } catch (err) {
      failWith('email', err instanceof Error ? err.message : 'Requesting the reset failed.')
    } finally {
      setBusy(false)
    }
  }

  const confirmReset = async () => {
    if (busy) return
    if (name.trim().length === 0) {
      failWith('name', 'Give this device a profile name.', fid('name'))
      return
    }
    if (resetToken.trim().length === 0) {
      failWith('token', 'Paste the reset code from the email.', fid('reset-code'))
      return
    }
    if (accountPassword.length < 8) {
      failWith('apass', 'The new password needs at least 8 characters.', fid('new-password'))
      return
    }
    if (accountPassword !== confirm) {
      failWith('confirm', 'The passwords do not match.', fid('repeat-new-password'))
      return
    }
    if (recovery.trim().length === 0) {
      failWith(
        'recovery',
        'Without the recovery code a reset cannot recover your training.',
        fid('recovery-code'),
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      await resetPasswordFromGate({
        name,
        email: email.trim(),
        token: resetToken,
        newPassword: accountPassword,
        recoveryCode: recovery,
      })
      onUnlocked()
    } catch (err) {
      failWith('recovery', err instanceof Error ? err.message : 'The reset failed.')
    } finally {
      setBusy(false)
    }
  }

  const create = async () => {
    if (busy) return
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      failWith('name', 'Give the profile a name.', fid('name'))
      return
    }
    if (passphrase.length < 4) {
      failWith('pass', 'The passphrase needs at least 4 characters.', fid('passphrase'))
      return
    }
    if (passphrase !== confirm) {
      failWith('confirm', 'The passphrases do not match.', fid('repeat-passphrase'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      /* Optional identity given at the door; seeds the encrypted snapshot so
         the programme designer and Today start prefilled, not blank. */
      const details: ProfileDetails = {}
      const ageN = Math.round(Number(age))
      if (age.trim() && Number.isFinite(ageN) && ageN > 0) details.age = ageN
      if (sex) details.sex = sex
      const heightN = Math.round(Number(height))
      if (height.trim() && Number.isFinite(heightN) && heightN > 0) details.heightCm = heightN
      await createProfile(trimmed, passphrase, {
        importLegacy: hasLegacy,
        gym,
        details: Object.keys(details).length > 0 ? details : undefined,
      })
      onUnlocked()
    } finally {
      setBusy(false)
    }
  }

  const switchTo = (next: Mode) => {
    setMode(next)
    setError(null)
    setShowPass(false)
    setPassphrase('')
    setConfirm('')
    if (next !== 'signin' && next !== 'reset') setAccountPassword('')
  }

  return (
    <div
      className={cn(
        'w-full rounded-xl bg-surface p-6 shadow-[var(--shadow-tile)] md:p-7',
        /* Everything above it argues; this is where the member acts. */
        accent && 'aurora-edge',
        className,
      )}
    >
      {mode === 'unlock' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void unlock()
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-xl text-ink">Who is training?</h2>
            <p className="text-2xs text-ink-3">Each profile is encrypted with its own passphrase.</p>
          </div>

          <div
            className={cn(
              'flex flex-col gap-2',
              /* Expanded, it scrolls rather than growing without limit: twelve
                 profiles would put the passphrase field below the fold again,
                 which is the problem this is here to solve. */
              showAllProfiles && profiles.length > 4 && 'max-h-64 overflow-y-auto pr-1',
            )}
          >
            {(showAllProfiles ? profiles : profiles.slice(0, PROFILE_PREVIEW)).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setSelectedId(p.id)
                  setError(null)
                  document.getElementById(fid('passphrase'))?.focus()
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
                {/* Pinned to the row's edge rather than trailing the name: as a
                    sibling it stops competing with the name for width, so a
                    long one truncates later and the space on the right is
                    used instead of left blank. */}
                {ROLE_TAGS[p.role] && (
                  <Tag tone="outline" className="shrink-0">
                    {ROLE_TAGS[p.role]}
                  </Tag>
                )}
              </button>
            ))}
          </div>

          {profiles.length > PROFILE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAllProfiles((v) => !v)}
              className="-mt-1 self-start text-2xs font-medium text-brand underline-offset-2 hover:underline"
            >
              {showAllProfiles
                ? 'Show fewer'
                : `${profiles.length - PROFILE_PREVIEW} more on this device`}
            </button>
          )}

          <Input
            id={fid('passphrase')}
            label="Passphrase"
            type={showPass ? 'text' : 'password'}
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value)
              setError(null)
            }}
            error={errorFor('unlock')}
            trailing={<RevealToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />}
          />

          <Button
            variant="primary"
            type="submit"
            size="lg"
            disabled={busy || !passphrase}
            className="w-full"
          >
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
            <Button variant="ghost" size="sm" onClick={() => switchTo('create')}>
              <Plus size={14} weight="bold" />
              New profile
            </Button>
            <Button variant="ghost" size="sm" onClick={() => switchTo('signin')}>
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
            <h2 className="text-xl text-ink">Sign in to sync</h2>
            <p className="text-2xs text-ink-3">
              Your training pulls onto this device. One password signs you in and decrypts it. The
              server only ever holds sealed rows.
            </p>
          </div>

          <Input
            id={fid('name')}
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            error={errorFor('name')}
            hint="How this profile appears on this device's lock screen."
          />
          <Input
            id={fid('email')}
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
            id={fid('account-password')}
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

          <Button variant="primary" type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? (
              <CircleNotch size={18} weight="bold" className="animate-spin" />
            ) : (
              <>
                Sign in and pull my training
                <ArrowRight size={18} weight="bold" />
              </>
            )}
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => switchTo(profiles.length > 0 ? 'unlock' : 'create')}
            >
              Back
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMode('reset')
                setResetStep('request')
                setError(null)
                setShowPass(false)
                setAccountPassword('')
              }}
            >
              Forgot your password?
            </Button>
          </div>
        </form>
      ) : mode === 'reset' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void (resetStep === 'request' ? requestReset() : confirmReset())
          }}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-xl text-ink">Reset your password</h2>
            <p className="text-2xs text-ink-3">
              {resetStep === 'request'
                ? 'A reset code goes to your account email. You will also need your recovery code. It is the only thing that can re-open the training data.'
                : `Code sent to ${email.trim()}. Check the inbox, then set the new password.`}
            </p>
          </div>

          {resetStep === 'request' ? (
            <>
              <Input
                id={fid('email')}
                label="Email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError(null)
                }}
                error={errorFor('email')}
              />
              <Button variant="primary" type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? (
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                ) : (
                  'Email me a reset code'
                )}
              </Button>
            </>
          ) : (
            <>
              <Input
                id={fid('name')}
                label="Name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                error={errorFor('name')}
                hint="How this profile appears on this device's lock screen."
              />
              <Input
                id={fid('reset-code')}
                label="Reset code"
                value={resetToken}
                onChange={(e) => {
                  setResetToken(e.target.value)
                  setError(null)
                }}
                error={errorFor('token')}
                hint="From the email that just arrived."
              />
              <Input
                id={fid('new-password')}
                label="New password"
                type={showPass ? 'text' : 'password'}
                value={accountPassword}
                onChange={(e) => {
                  setAccountPassword(e.target.value)
                  setError(null)
                }}
                error={errorFor('apass')}
                hint="At least 8 characters."
                trailing={<RevealToggle shown={showPass} onToggle={() => setShowPass((v) => !v)} />}
              />
              <Input
                id={fid('repeat-new-password')}
                label="Repeat new password"
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  setError(null)
                }}
                error={errorFor('confirm')}
              />
              <Input
                id={fid('recovery-code')}
                label="Recovery code"
                value={recovery}
                onChange={(e) => {
                  setRecovery(e.target.value)
                  setError(null)
                }}
                error={errorFor('recovery')}
                hint="The 25-character code shown when sync was turned on."
              />
              <Button variant="primary" type="submit" size="lg" disabled={busy} className="w-full">
                {busy ? (
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                ) : (
                  'Reset and sign in'
                )}
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            onClick={() => {
              setMode('signin')
              setResetStep('request')
              setError(null)
              setShowPass(false)
              setResetToken('')
              setRecovery('')
              setAccountPassword('')
              setConfirm('')
            }}
          >
            Back to sign in
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
            <h2 className="text-xl text-ink">Create your profile</h2>
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
            id={fid('name')}
            label="Name"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            error={errorFor('name')}
          />
          <Combobox
            id={fid('gym')}
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
          <div className="grid grid-cols-3 gap-3">
            <Input
              id={fid('age')}
              label="Age"
              value={age}
              onChange={(e) => {
                setAge(e.target.value)
                setError(null)
              }}
              inputMode="numeric"
            />
            <FormSelect
              label="Sex"
              value={sex}
              onValueChange={(v) => setSex(v as typeof sex)}
              /* A word, not a dash. The em-dash read as a value rather than an
                 absence, and it was the one on this page a reader could see. */
              placeholder="Select"
              options={(['hombre', 'mujer', 'otro'] as const).map((v) => ({
                value: v,
                label: SEX_LABELS[v],
              }))}
            />
            <Input
              id={fid('height')}
              label="Height"
              value={height}
              onChange={(e) => {
                setHeight(e.target.value)
                setError(null)
              }}
              inputMode="numeric"
              suffix="cm"
            />
          </div>
          <p className="-mt-1 text-2xs text-ink-3">
            Optional. Prefills your programme and unlocks BMI on Today.
          </p>
          <Input
            id={fid('passphrase')}
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
            id={fid('repeat-passphrase')}
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
              Training data from before profiles existed was found on this device. It will be moved
              into this profile and encrypted.
            </p>
          )}

          <Button variant="primary" type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? (
              <CircleNotch size={18} weight="bold" className="animate-spin" />
            ) : (
              'Create profile'
            )}
          </Button>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {profiles.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => switchTo('unlock')}>
                Back to profiles
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => switchTo('signin')}>
              <CloudCheck size={14} weight="bold" />
              Sign in to sync
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
