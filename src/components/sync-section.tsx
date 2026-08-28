import { useState } from 'react'
import { ArrowsClockwise, CheckCircle, CloudCheck, Copy } from '@phosphor-icons/react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/ui/Button'
import { Collapse } from '@/ui/Collapse'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { activeProfile } from '@/lib/profiles'
import {
  createSyncAccount,
  linkSyncAccount,
  normalizeServer,
  reauthSync,
  readSyncLink,
  syncNow,
  unlinkSync,
} from '@/lib/sync'
import { useGym } from '@/store/useGym'

/**
 * Sync lives in the Data tab because that is where people already think
 * about where their training is. Off by default; the panel says exactly what
 * leaves the device (ciphertext) and what the server can do (sign you in),
 * because the lock screen's promise only survives if this copy is honest.
 */

type DialogKind = 'create' | 'link' | null

function formatSyncedAt(iso: string | undefined): string | null {
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function SyncSection() {
  const profileId = activeProfile()?.id ?? null
  const workouts = useGym((s) => s.workouts)
  const [, forceRender] = useState(0)
  const rerender = () => forceRender((n) => n + 1)

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null)
  const [reauthPassword, setReauthPassword] = useState('')

  if (!profileId) return null
  const link = readSyncLink(profileId)

  const runSync = async () => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      const result = await syncNow(profileId)
      if (result.ok) {
        setStatus({
          tone: 'good',
          text:
            result.pulled === 0 && result.pushed === 0
              ? 'Up to date. Nothing had changed.'
              : `Up to date. Pulled ${result.pulled}, pushed ${result.pushed}.`,
        })
      } else {
        setStatus({ tone: 'danger', text: result.message })
      }
    } finally {
      setBusy(false)
      rerender()
    }
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <CloudCheck size={18} />
          Sync across devices
        </h2>
        {!link && (
          <p className="max-w-[62ch] text-sm text-ink-3">
            Optional, and off by default. One account password signs your devices in and decrypts
            your training; the server only ever holds sealed rows it cannot read.
          </p>
        )}
      </div>

      {link ? (
        <div className="flex flex-col gap-3">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs text-ink-3">Account</dt>
              <dd className="truncate text-sm font-medium text-ink">{link.email}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs text-ink-3">Server</dt>
              <dd className="num truncate text-sm text-ink-2">{link.server}</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-2xs text-ink-3">Last synced</dt>
              <dd className="num text-sm text-ink-2">{formatSyncedAt(link.lastSyncAt) ?? 'Never'}</dd>
            </div>
          </dl>

          {link.token ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void runSync()} disabled={busy}>
                <ArrowsClockwise size={16} className={busy ? 'animate-spin' : undefined} />
                {busy ? 'Syncing' : 'Sync now'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  unlinkSync(profileId)
                  setStatus(null)
                  rerender()
                }}
              >
                Unlink this device
              </Button>
            </div>
          ) : (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                if (busy || !reauthPassword) return
                setBusy(true)
                setStatus(null)
                reauthSync(profileId, reauthPassword)
                  .then(() => {
                    setReauthPassword('')
                    return runSync()
                  })
                  .catch((error: unknown) => {
                    setStatus({ tone: 'danger', text: error instanceof Error ? error.message : 'Sign-in failed.' })
                  })
                  .finally(() => {
                    setBusy(false)
                    rerender()
                  })
              }}
            >
              <div className="min-w-52 flex-1">
                <Input
                  label="Password"
                  type="password"
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                  hint="The session expired; signing in resumes sync. Nothing about your data changed."
                />
              </div>
              <Button type="submit" disabled={busy || !reauthPassword}>
                Sign in
              </Button>
            </form>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog('create')}>Create sync account</Button>
          <Button variant="secondary" onClick={() => setDialog('link')}>
            I already have one
          </Button>
        </div>
      )}

      {status && (
        <p
          role="status"
          className={
            status.tone === 'good'
              ? 'rounded-md bg-good-soft px-3 py-2 text-sm text-good'
              : 'rounded-md bg-danger-soft px-3 py-2 text-sm text-danger'
          }
        >
          {status.text}
        </p>
      )}

      <CreateAccountDialog
        open={dialog === 'create'}
        onOpenChange={(open) => setDialog(open ? 'create' : null)}
        profileId={profileId}
        onCreated={(code) => {
          setDialog(null)
          setRecoveryCode(code)
          setStatus({ tone: 'good', text: 'Sync is on. Your history is on the server, sealed.' })
          rerender()
        }}
      />
      <LinkAccountDialog
        open={dialog === 'link'}
        onOpenChange={(open) => setDialog(open ? 'link' : null)}
        profileId={profileId}
        hasLocalData={workouts.length > 0}
        onLinked={() => {
          setDialog(null)
          setStatus({ tone: 'good', text: 'Linked. Both histories are merged and syncing.' })
          rerender()
        }}
      />
      <RecoveryCodeDialog code={recoveryCode} onDone={() => setRecoveryCode(null)} />
    </Panel>
  )
}

function CreateAccountDialog({
  open,
  onOpenChange,
  profileId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  onCreated: (recoveryCode: string) => void
}) {
  const [server, setServer] = useState('/pb')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    if (password.length < 8) {
      setError('The account password needs at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { recoveryCode } = await createSyncAccount(profileId, {
        server: normalizeServer(server),
        email: email.trim(),
        password,
      })
      onCreated(recoveryCode)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Creating the account failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a sync account</DialogTitle>
          <DialogDescription>
            One password from here on: it signs your devices in and it is what decrypts your
            training — this profile stops using its old passphrase. The server only ever holds
            sealed rows.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="At least 8 characters."
          />
          <Input
            label="Repeat password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={error ?? undefined}
          />
          <Collapse header="Advanced">
            <div className="pt-2">
              <Input
                label="Server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                hint="Only for self-hosters pointing at another sync server. Everyone else keeps the app's own /pb."
              />
            </div>
          </Collapse>
          <Button type="submit" disabled={busy || !email || !password}>
            {busy ? 'Creating…' : 'Create and upload'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LinkAccountDialog({
  open,
  onOpenChange,
  profileId,
  hasLocalData,
  onLinked,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profileId: string
  hasLocalData: boolean
  onLinked: () => void
}) {
  const [server, setServer] = useState('/pb')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await linkSyncAccount(profileId, {
        server: normalizeServer(server),
        email: email.trim(),
        password,
      })
      onLinked()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Linking failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link an existing account</DialogTitle>
          <DialogDescription>
            {hasLocalData
              ? 'This profile’s rows move under the account and both histories merge. Nothing is lost on either side; the account password opens this profile from here on.'
              : 'This device pulls your history from the account and keeps syncing. The account password opens this profile from here on.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error ?? undefined}
          />
          <Collapse header="Advanced">
            <div className="pt-2">
              <Input
                label="Server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                hint="Only if the account lives on a different sync server."
              />
            </div>
          </Collapse>
          <Button type="submit" disabled={busy || !email || !password}>
            {busy ? 'Linking…' : 'Link and merge'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RecoveryCodeDialog({ code, onDone }: { code: string | null; onDone: () => void }) {
  const [copied, setCopied] = useState(false)

  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onDone()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Your recovery code</DialogTitle>
          <DialogDescription>
            If you ever lose the password, this code is the only thing that can still decrypt
            your training. It is shown once and stored nowhere — write it down somewhere real.
          </DialogDescription>
        </DialogHeader>
        <p className="num rounded-md bg-surface-2 px-4 py-3 text-center text-lg font-semibold tracking-wide text-ink select-all">
          {code}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              if (code) void navigator.clipboard?.writeText(code).then(() => setCopied(true))
            }}
          >
            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            I wrote it down
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
