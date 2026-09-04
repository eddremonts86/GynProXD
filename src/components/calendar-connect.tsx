import { useState } from 'react'
import {
  AppleLogo,
  ArrowsClockwise,
  CalendarCheck,
  GoogleLogo,
  MicrosoftOutlookLogo,
} from '@phosphor-icons/react'
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
  'not-an-address':
    'That does not look like a published calendar address. It should start with webcal:// or https://, and it cannot be a local one.',
  'not-a-calendar':
    'That address answered, with something that is not a calendar. A link to a calendar page is not the same as the calendar address.',
  'too-large': 'That calendar is too large to read. Publishing a single calendar rather than all of them usually fixes it.',
  unpublished:
    'That calendar is no longer published, so it cannot be read again. Publish it again where it lives, or paste a new link. What it already put on your days stays until you do.',
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

/**
 * Google and Microsoft, which are the same trade in the same words.
 *
 * Both are a scoped token that may only read events, held here until the member
 * disconnects, obtained through the provider's own consent screen. Writing the
 * panel twice would have been two copies of one paragraph waiting to disagree
 * with each other.
 */
function TokenBlock({
  link,
  name,
  icon,
  extra,
  keepTitles,
  onKeepTitles,
}: {
  link: CalendarLink['google']
  name: string
  icon: React.ReactNode
  extra?: string
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
}) {
  if (!link.offered) return null
  const { state } = link
  const busy = state.kind === 'working' || state.kind === 'checking'

  return (
    /* Named, because there are three of these and "Read it again" means a
       different calendar in each. A screen reader gets the same benefit. */
    <Panel padding="lg" role="group" aria-label={name} className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {name}
      </span>

      {state.kind === 'connected' ? (
        <Connected
          state={state}
          label={`A ${name}`}
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
            {extra ? ` ${extra}` : ''}
          </p>
          <div>
            <Button variant="secondary" onClick={() => void link.connect()} disabled={busy}>
              {busy ? 'One moment' : `Connect ${name}`}
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

/**
 * The two ways into an iCloud calendar, in the order a person should try them.
 *
 * They are not variations of each other and the screen says so, because the
 * difference is the whole decision:
 *
 *   **A published address** is a link iCloud makes for one calendar. Nothing to
 *   remember, nothing to revoke from a list, and this server is given one
 *   calendar rather than an account. What it costs is that the link is not
 *   authenticated — anyone who has it can read that calendar — which is why it
 *   is sealed here and never shown back.
 *
 *   **An app-specific password** is live for every calendar at once and stays
 *   private. What it costs is that iCloud cannot grant read-only access, so the
 *   password can do everything, and the member has to make one by hand.
 *
 * Both can be attached at once and one has never anything to do with the other:
 * they are separate rows, separate reads, and separate blocks on the day.
 */
function AppleBlock({
  appleLink,
  urlLink,
  keepTitles,
  onKeepTitles,
}: {
  appleLink: CalendarLink['apple']
  urlLink: CalendarLink['url']
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
}) {
  const [appleId, setAppleId] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')
  if (!appleLink.offered && !urlLink.offered) return null

  const apple = appleLink.state
  const sub = urlLink.state
  const appleBusy = apple.kind === 'working' || apple.kind === 'checking'
  const subBusy = sub.kind === 'working' || sub.kind === 'checking'
  const appleReady = /^[^@\s]+@[^@\s]+$/.test(appleId.trim()) && password.trim().length >= 8
  /* Only the shapes the server will accept, so the button does not invite a
     round trip that is already known to fail. */
  const subReady = /^(webcal|https?):\/\/\S+\.\S+/i.test(address.trim())

  return (
    <Panel padding="lg" role="group" aria-label="Apple Calendar" className="flex flex-col gap-5">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <AppleLogo size={18} />
        Apple Calendar
      </span>
      <p className="max-w-[62ch] text-sm text-ink-3">
        iCloud has no sign-in button to offer, so there are two ways in. The first asks you to
        remember nothing and gives us one calendar. The second is live for all of them and stays
        private. You can use either, or both.
      </p>

      {urlLink.offered && (
        <section className="flex flex-col gap-3" aria-label="Subscribe to a published calendar">
          <span className="text-xs font-medium text-ink-2">
            A published link — easiest, and no password
          </span>
          {sub.kind === 'connected' ? (
            <Connected
              state={sub}
              label="A published calendar"
              keepTitles={keepTitles}
              onKeepTitles={onKeepTitles}
              onRefresh={() => void urlLink.refresh()}
              onDisconnect={() => void urlLink.disconnect()}
              busy={subBusy}
            />
          ) : (
            <>
              <p className="max-w-[62ch] text-sm text-ink-3">
                iCloud can publish one calendar as a link. You paste it here, we read that calendar
                and nothing else, and there is no password anywhere. The one thing to know before
                you do it: a published link is not protected, so anyone who gets hold of it can read
                that calendar. We keep it sealed and never show it back, and you can stop it from
                iCloud whenever you like.
              </p>
              <ol className="flex max-w-[62ch] list-decimal flex-col gap-1 pl-5 text-2xs text-ink-3">
                <li>
                  On <span className="text-ink-2">iPhone</span>: Calendar app, Calendars, then tap
                  the ⓘ beside the calendar you want.
                </li>
                <li>
                  On <span className="text-ink-2">Mac</span>: Calendar app, hover over the
                  calendar&apos;s name in the list on the left, then click the share button that
                  appears.
                </li>
                <li>
                  On <span className="text-ink-2">iCloud.com</span>: open Calendar, hover over the
                  calendar in the sidebar and click the information button.
                </li>
                <li>
                  Turn on <span className="text-ink-2">Public Calendar</span>, then Copy the link
                  and paste it below. It starts with webcal://
                </li>
              </ol>
              <p className="max-w-[62ch] text-2xs text-ink-3">
                Only a calendar you own in iCloud can be published. One that somebody shared with
                you, a holiday calendar, or one kept On My iPhone or On My Mac has no Public Calendar
                switch at all — for those, use an app-specific password below, or the calendar file.
              </p>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (subReady) void urlLink.connect(address.trim())
                }}
              >
                <Input
                  label="Calendar link"
                  type="text"
                  autoComplete="off"
                  placeholder="webcal://p01-calendars.icloud.com/published/..."
                  hint="From any calendar that publishes one, not only iCloud. It is read, never written to."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
                <div>
                  <Button type="submit" variant="secondary" disabled={subBusy || !subReady}>
                    {subBusy ? 'Reading that calendar' : 'Subscribe to this calendar'}
                  </Button>
                </div>
              </form>
            </>
          )}
          {sub.kind === 'failed' && (
            <p className="max-w-[58ch] text-sm text-danger">{FAILED[sub.why]}</p>
          )}
        </section>
      )}

      {appleLink.offered && urlLink.offered && <hr className="border-line" />}

      {/* The section below is named without the words "app-specific password":
          a query for that field matches any element whose accessible name
          contains it, and a section carrying the same phrase resolves to two. */}
      {appleLink.offered && (
        <section className="flex flex-col gap-3" aria-label="Connect iCloud with a generated password">
          <span className="text-xs font-medium text-ink-2">
            An app-specific password — every calendar, kept private
          </span>
          {apple.kind === 'connected' ? (
            <Connected
              state={apple}
              label="An iCloud calendar"
              keepTitles={keepTitles}
              onKeepTitles={onKeepTitles}
              onRefresh={() => void appleLink.refresh()}
              onDisconnect={() => void appleLink.disconnect()}
              busy={appleBusy}
            />
          ) : (
            <>
              <p className="max-w-[62ch] text-sm text-ink-3">
                This reads all of your calendars and needs nothing published. It takes an
                app-specific password you make yourself, which is not the same as your Apple ID
                password — that one will be refused. iCloud has no way to grant read-only access, so
                the password you make can do more than we use; we use it only to read the next three
                weeks, and our server keeps it sealed until you disconnect. Apple is where you
                revoke it, and revoking it there is enough.
              </p>
              <ol className="flex max-w-[62ch] list-decimal flex-col gap-1 pl-5 text-2xs text-ink-3">
                <li>
                  Sign in at{' '}
                  <a
                    href="https://account.apple.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-ink-2 underline"
                  >
                    account.apple.com
                  </a>{' '}
                  and go to Sign-In and Security.
                </li>
                <li>Under App-Specific Passwords, generate one and name it enForma.</li>
                <li>
                  Paste it below with the Apple ID it belongs to — the address the account is in,
                  not an iCloud alias.
                </li>
              </ol>
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (appleReady) void appleLink.connect(appleId, password)
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
                  <Button type="submit" variant="secondary" disabled={appleBusy || !appleReady}>
                    {appleBusy ? 'Checking with iCloud' : 'Connect Apple Calendar'}
                  </Button>
                </div>
              </form>
            </>
          )}
          {apple.kind === 'failed' && (
            <p className="max-w-[58ch] text-sm text-danger">{FAILED[apple.why]}</p>
          )}
        </section>
      )}
    </Panel>
  )
}

export function CalendarConnect({ link }: { link: CalendarLink }) {
  if (!link.offered) return null
  return (
    <div className="flex flex-col gap-3">
      <TokenBlock
        link={link.google}
        name="Google Calendar"
        icon={<GoogleLogo size={18} />}
        keepTitles={link.keepTitles}
        onKeepTitles={link.setKeepTitles}
      />
      <TokenBlock
        link={link.microsoft}
        name="Microsoft Calendar"
        icon={<MicrosoftOutlookLogo size={18} />}
        /* The one thing Microsoft needs that the other two do not, said rather
           than done quietly. */
        extra="It is also told which timezone you are in, because that is how Microsoft returns the right hours."
        keepTitles={link.keepTitles}
        onKeepTitles={link.setKeepTitles}
      />
      <AppleBlock
        appleLink={link.apple}
        urlLink={link.url}
        keepTitles={link.keepTitles}
        onKeepTitles={link.setKeepTitles}
      />
    </div>
  )
}
