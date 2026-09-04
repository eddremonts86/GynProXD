import { useState } from 'react'
import { AppleLogo, ArrowsClockwise, CalendarCheck, GoogleLogo } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import { formatShortDate } from '@/lib/labels'
import type { CalendarLink, LinkState } from '@/hooks/use-calendar-link'

/**
 * Connecting a real calendar, and what that costs, in the same panel.
 *
 * The sentence above each button is the point of this component. Everything
 * else in this app keeps a member's data on their device; these two ask them to
 * let a server hold a credential that can read their diary until they take it
 * back. That is a real trade and it is stated in the words somebody would use,
 * not in a link to a policy.
 *
 * The two are not the same trade and the copy does not pretend they are.
 * Google's is a scoped token that can only read events and that we can revoke
 * from here. Apple's is an app-specific password, which is a narrower key than
 * an Apple ID password and still a password, and only they can revoke it. That
 * difference is said out loud rather than smoothed over, because it is the
 * thing a careful person would want to know before typing.
 */

const FAILED: Record<
  Exclude<LinkState, { kind: 'off' | 'checking' | 'disconnected' | 'connected' | 'working' }>['why'],
  string
> = {
  'no-account': 'This profile has no sync account, and a calendar belongs to one.',
  unavailable: 'This server cannot connect a calendar.',
  refused: 'Part of Pro, and this account is not.',
  'not-connected': 'No calendar is connected to this account.',
  withdrawn:
    'The connection is no longer accepted, so this calendar cannot be read again. What it already put on your days stays until you reconnect or disconnect.',
  unreachable: 'The calendar could not be reached. Nothing on your day changed.',
  rejected:
    'iCloud refused that. An app-specific password is not the same as your Apple ID password.',
}

function whenSynced(iso: string | null): string {
  if (!iso) return 'not read yet'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'not read yet'
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return `read ${formatShortDate(day)}, ${time}`
}

function Pulled({ count }: { count: number }) {
  return (
    <p className="text-sm text-ink-3">
      {count === 0
        ? 'Nothing in the next three weeks that blocks time.'
        : count === 1
          ? '1 block on your days, from your calendar.'
          : `${count} blocks on your days, from your calendar.`}
    </p>
  )
}

function Titles({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-2xs text-ink-3">
      <Switch aria-label="Keep the titles" checked={on} onCheckedChange={onChange} />
      Keep the titles on this device
    </label>
  )
}

/** The shared body of a connected provider: who it is, when it was read, and the two buttons. */
function Connected({
  state,
  label,
  keepTitles,
  onKeepTitles,
  onRefresh,
  onDisconnect,
  busy,
}: {
  state: Extract<LinkState, { kind: 'connected' }>
  label: string
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
  onRefresh: () => void
  onDisconnect: () => void
  busy: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <CalendarCheck size={18} className="text-ink-2" />
        <span className="text-sm text-ink">{state.status.account || label}</span>
        <span className="num text-2xs text-ink-3">{whenSynced(state.status.lastSynced)}</span>
      </div>
      {state.pulled !== null && <Pulled count={state.pulled} />}
      <Titles on={keepTitles} onChange={onKeepTitles} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={onRefresh} disabled={busy}>
          <ArrowsClockwise size={16} />
          Read it again
        </Button>
        <Button variant="dangerQuiet" size="sm" onClick={onDisconnect} disabled={busy}>
          Disconnect
        </Button>
      </div>
    </>
  )
}

function GoogleBlock({ link, keepTitles, onKeepTitles }: {
  link: CalendarLink['google']
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
}) {
  if (!link.offered) return null
  const { state } = link
  const busy = state.kind === 'working' || state.kind === 'checking'

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <GoogleLogo size={18} />
        Google Calendar
      </span>

      {state.kind === 'connected' ? (
        <Connected
          state={state}
          label="A Google calendar"
          keepTitles={keepTitles}
          onKeepTitles={onKeepTitles}
          onRefresh={() => void link.refresh()}
          onDisconnect={() => void link.disconnect()}
          busy={busy}
        />
      ) : (
        <>
          <p className="max-w-[62ch] text-sm text-ink-3">
            Connect it and the next three weeks of it shape your day, refreshed when you ask. Our
            server keeps a key that can read your calendar until you disconnect it, and nothing
            else: it may only read, it never writes, and event titles stay off your device unless
            you turn them on.
          </p>
          <div>
            <Button variant="secondary" onClick={() => void link.connect()} disabled={busy}>
              {busy ? 'One moment' : 'Connect Google Calendar'}
            </Button>
          </div>
        </>
      )}

      {state.kind === 'failed' && (
        <p className="max-w-[58ch] text-sm text-danger">{FAILED[state.why]}</p>
      )}
    </Panel>
  )
}

function AppleBlock({ link, keepTitles, onKeepTitles }: {
  link: CalendarLink['apple']
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
}) {
  const [appleId, setAppleId] = useState('')
  const [password, setPassword] = useState('')
  if (!link.offered) return null
  const { state } = link
  const busy = state.kind === 'working' || state.kind === 'checking'
  const ready = /^[^@\s]+@[^@\s]+$/.test(appleId.trim()) && password.trim().length >= 8

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <AppleLogo size={18} />
        Apple Calendar
      </span>

      {state.kind === 'connected' ? (
        <Connected
          state={state}
          label="An iCloud calendar"
          keepTitles={keepTitles}
          onKeepTitles={onKeepTitles}
          onRefresh={() => void link.refresh()}
          onDisconnect={() => void link.disconnect()}
          busy={busy}
        />
      ) : (
        <>
          <p className="max-w-[62ch] text-sm text-ink-3">
            iCloud has no way to grant read-only access, so this needs an app-specific password you
            make yourself. Our server keeps that password, sealed, until you disconnect it; it uses
            it only to read the next three weeks. Apple is where you revoke it, and revoking it
            there is enough.
          </p>
          <ol className="flex max-w-[62ch] list-decimal flex-col gap-1 pl-5 text-2xs text-ink-3">
            <li>
              Sign in at{' '}
              <a
                href="https://appleid.apple.com"
                target="_blank"
                rel="noreferrer"
                className="text-ink-2 underline"
              >
                appleid.apple.com
              </a>{' '}
              and go to Sign-In and Security.
            </li>
            <li>Under App-Specific Passwords, generate one and name it enForma.</li>
            <li>Paste it below with the Apple ID it belongs to.</li>
          </ol>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (ready) void link.connect(appleId, password)
            }}
          >
            <Input
              label="Apple ID"
              type="email"
              autoComplete="off"
              placeholder="you@icloud.com"
              value={appleId}
              onChange={(e) => setAppleId(e.target.value)}
            />
            <Input
              label="App-specific password"
              type="password"
              autoComplete="off"
              placeholder="xxxx-xxxx-xxxx-xxxx"
              hint="Not your Apple ID password. The one you just generated."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <div>
              <Button type="submit" variant="secondary" disabled={busy || !ready}>
                {busy ? 'Checking with iCloud' : 'Connect Apple Calendar'}
              </Button>
            </div>
          </form>
        </>
      )}

      {state.kind === 'failed' && (
        <p className="max-w-[58ch] text-sm text-danger">{FAILED[state.why]}</p>
      )}
    </Panel>
  )
}

export function CalendarConnect({ link }: { link: CalendarLink }) {
  if (!link.offered) return null
  return (
    <div className="flex flex-col gap-3">
      <GoogleBlock link={link.google} keepTitles={link.keepTitles} onKeepTitles={link.setKeepTitles} />
      <AppleBlock link={link.apple} keepTitles={link.keepTitles} onKeepTitles={link.setKeepTitles} />
    </div>
  )
}
