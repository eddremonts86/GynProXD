import { useState } from 'react'
import {
  AppleLogo,
  ArrowsClockwise,
  CalendarCheck,
  CaretDown,
  GoogleLogo,
  MicrosoftOutlookLogo,
} from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatShortDate } from '@/lib/labels'
import type { CalendarLink, LinkState } from '@/hooks/use-calendar-link'
import type { CalendarFailure, CalendarStatus } from '@/lib/calendar-link'

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
  state: { status: CalendarStatus; pulled?: number | null }
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
      {state.pulled != null && <Pulled count={state.pulled} />}
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
 * Failures that another go could get past.
 *
 * The distinction decides what the panel offers, and getting it the other way
 * round is worse than either: a network that dropped wants "read it again", and
 * a credential the provider stopped accepting wants the consent screen — a
 * retry button there just fails again, politely, forever.
 */
const RETRYABLE = new Set<CalendarFailure>(['unreachable', 'unavailable'])

/**
 * What a provider is attached to, or nothing.
 *
 * `connected` obviously, and a failure that might pass next time — a read that
 * timed out has not disconnected anything, and dropping back to the connect
 * form would lose the two buttons that matter and ask for a credential the
 * server still holds.
 */
function attachedTo(state: LinkState): { status: CalendarStatus; pulled?: number | null } | null {
  if (state.kind === 'connected') return { status: state.status, pulled: state.pulled }
  if (state.kind === 'failed' && state.status && RETRYABLE.has(state.why)) {
    return { status: state.status }
  }
  return null
}

/**
 * Whether there is still a row to get rid of, while the form is on screen.
 *
 * A grant somebody revoked at Google leaves the link stored here: the copy says
 * what it left on the day and that it stays until you reconnect or disconnect,
 * and until this there was no disconnect to press. Reconnecting had a button
 * and leaving did not.
 */
function stillStored(state: LinkState): boolean {
  return state.kind === 'failed' && !!state.status && !RETRYABLE.has(state.why)
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
  const attached = attachedTo(state)

  return (
    /* Named, because there are three of these and "Read it again" means a
       different calendar in each. A screen reader gets the same benefit. */
    <Panel padding="lg" role="group" aria-label={name} className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        {icon}
        {name}
      </span>

      {attached ? (
        <Connected
          state={attached}
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
      {stillStored(state) && (
        <div>
          <Button variant="dangerQuiet" size="sm" onClick={() => void link.disconnect()} disabled={busy}>
            Disconnect
          </Button>
        </div>
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
/**
 * One way in, folded away until somebody wants it.
 *
 * `<details>` rather than a tab strip: two mutually exclusive explanations that
 * each run to a paragraph and a list are a disclosure, and the platform already
 * has one that is keyboard-operable, announced correctly and needs no state of
 * ours. A tab component would have been more code for the same job and one more
 * thing to get the focus ring wrong in.
 */
function Way({
  summary,
  open,
  children,
}: {
  summary: string
  open?: boolean
  children: React.ReactNode
}) {
  return (
    <details
      open={open}
      className="group rounded-lg border border-line bg-surface-2 open:bg-surface [&::details-content]:overflow-hidden"
    >
      <summary className="cursor-pointer list-none rounded-lg px-4 py-3 text-xs font-medium text-ink-2 outline-none marker:content-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand">
        <span className="flex items-center justify-between gap-3">
          {summary}
          <CaretDown
            size={14}
            className="shrink-0 transition-transform duration-150 group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-4 pt-1 pb-4">{children}</div>
    </details>
  )
}

/**
 * The two ways into an iCloud calendar, in a dialog of their own.
 *
 * They were inline in the sheet and the sheet could not carry them: between
 * them they need two arguments about privacy, per-platform steps for three
 * surfaces, the reason a family calendar has no switch at all, and two forms.
 * That is a page, not a panel, and the panel it was in also has to hold the
 * hours somebody does not choose.
 *
 * They are not variations of each other and the dialog says so, because the
 * difference is the whole decision:
 *
 *   **A published address** is a link iCloud makes for one calendar. Nothing to
 *   remember, and this server is given one calendar rather than an account.
 *   What it costs is that the link is not authenticated — anyone who has it can
 *   read that calendar.
 *
 *   **An app-specific password** is live for every calendar at once and stays
 *   private. What it costs is that iCloud cannot grant read-only access, so the
 *   password can do everything, and the member makes one by hand.
 *
 * Both can be attached at once and neither has anything to do with the other:
 * separate rows, separate reads, separate blocks on the day.
 */
function AppleWays({
  appleLink,
  urlLink,
  onDone,
}: {
  appleLink: CalendarLink['apple']
  urlLink: CalendarLink['url']
  onDone: () => void
}) {
  const [appleId, setAppleId] = useState('')
  const [password, setPassword] = useState('')
  const [address, setAddress] = useState('')

  const apple = appleLink.state
  const sub = urlLink.state
  const appleBusy = apple.kind === 'working'
  const subBusy = sub.kind === 'working'
  const appleReady = /^[^@\s]+@[^@\s]+$/.test(appleId.trim()) && password.trim().length >= 8
  /* Only the shapes the server will accept, so the button does not invite a
     round trip that is already known to fail. */
  const subReady = /^(webcal|https?):\/\/\S+\.\S+/i.test(address.trim())

  return (
    <div className="flex flex-col gap-3">
      {urlLink.offered && (
        <Way summary="A published link — easiest, and no password" open>
          <div className="flex flex-col gap-3" role="region" aria-label="Subscribe to a published calendar">
            <p className="text-sm text-ink-3">
              iCloud can publish one calendar as a link. You paste it here, we read that calendar and
              nothing else, and there is no password anywhere. The one thing to know before you do
              it: a published link is not protected, so anyone who gets hold of it can read that
              calendar. We keep it sealed and never show it back, and you can stop it from iCloud
              whenever you like.
            </p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-2xs text-ink-3">
              <li>
                On <span className="text-ink-2">iPhone</span>: Calendar app, Calendars, then tap the
                ⓘ beside the calendar you want.
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
                Turn on <span className="text-ink-2">Public Calendar</span>, then Copy the link and
                paste it below. It starts with webcal://
              </li>
            </ol>
            {/**
             * Apple's own guides rather than pictures of them. Their support
             * pages carry the screenshots and those are Apple's: copying them
             * into this repository, or hotlinking their CDN from a product, is
             * redistributing somebody else's material — and it goes stale the
             * day they redesign. A link costs one tap and is right forever.
             */}
            <p className="text-2xs text-ink-3">
              Apple shows it with pictures, on their side:{' '}
              {[
                ['iPhone', 'https://support.apple.com/guide/iphone/share-icloud-calendars-iph7613c4fb/ios'],
                ['Mac', 'https://support.apple.com/guide/calendar/share-icloud-calendars-icl32362/mac'],
                ['iCloud.com', 'https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud'],
              ].map(([label, href], i) => (
                <span key={href}>
                  {i > 0 ? ' · ' : ''}
                  <a href={href} target="_blank" rel="noreferrer" className="text-ink-2 underline">
                    {label}
                  </a>
                </span>
              ))}
            </p>
            <p className="rounded-md bg-surface-2 p-3 text-2xs text-ink-3">
              <span className="text-ink-2">Only a calendar you own can be published</span>, and the
              panel that opens is what tells you which one you have. A calendar of your own says
              Share Calendar and carries the Public Calendar switch. A{' '}
              <span className="text-ink-2">family calendar</span> says so instead, lists the people it
              is already shared with, names its owner, and has no switch anywhere — iCloud lets
              nobody but the owner publish one. A holiday calendar, one somebody else shared with
              you, and one kept On My iPhone or On My Mac are the same story. For any of those, use
              an app-specific password below, or the calendar file. The names appear in your
              device&apos;s language.
            </p>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (subReady) void urlLink.connect(address.trim()).then(onDone)
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
            {sub.kind === 'failed' && <p className="text-sm text-danger">{FAILED[sub.why]}</p>}
          </div>
        </Way>
      )}

      {appleLink.offered && (
        <Way summary="An app-specific password — every calendar, kept private">
          {/* Named without the words "app-specific password": a query for that
              field matches any element whose accessible name contains it, and a
              wrapper carrying the same phrase resolves to two. */}
          <div className="flex flex-col gap-3" role="region" aria-label="Connect iCloud with a generated password">
            <p className="text-sm text-ink-3">
              This reads all of your calendars and needs nothing published. It takes an app-specific
              password you make yourself, which is not the same as your Apple ID password — that one
              will be refused. iCloud has no way to grant read-only access, so the password you make
              can do more than we use; we use it only to read the next three weeks, and our server
              keeps it sealed until you disconnect. Apple is where you revoke it, and revoking it
              there is enough.
            </p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-2xs text-ink-3">
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
                Paste it below with the Apple ID it belongs to — the address the account is in, not
                an iCloud alias.
              </li>
            </ol>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (appleReady) void appleLink.connect(appleId, password).then(onDone)
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
            {apple.kind === 'failed' && <p className="text-sm text-danger">{FAILED[apple.why]}</p>}
          </div>
        </Way>
      )}
    </div>
  )
}

/**
 * Apple in the sheet: what is attached, and a door to the ways in.
 *
 * Managing stays here and connecting moved out. A member who has a calendar
 * attached wants "read it again" and "disconnect" where the rest of their day
 * is, not two clicks into a dialog; a member who has none needs the room the
 * dialog has. Both halves of Apple are drawn here when both are attached,
 * because they are two calendars and the day shows blocks from each.
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
  const [open, setOpen] = useState(false)
  if (!appleLink.offered && !urlLink.offered) return null

  const apple = appleLink.state
  const sub = urlLink.state
  const attachedApple = attachedTo(apple)
  const attachedSub = attachedTo(sub)
  const attached = !!attachedApple || !!attachedSub
  /* A failure belongs beside the thing that failed. Inside the dialog it would
     be behind a click, and after a "read it again" from here the dialog is not
     even open. */
  const failures = [sub, apple].filter(
    (state): state is Extract<LinkState, { kind: 'failed' }> => state.kind === 'failed',
  )

  return (
    <Panel padding="lg" role="group" aria-label="Apple Calendar" className="flex flex-col gap-4">
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        <AppleLogo size={18} />
        Apple Calendar
      </span>

      {attachedSub && (
        <div role="region" aria-label="A published calendar">
          <Connected
            state={attachedSub}
            label="A published calendar"
            keepTitles={keepTitles}
            onKeepTitles={onKeepTitles}
            onRefresh={() => void urlLink.refresh()}
            onDisconnect={() => void urlLink.disconnect()}
            /* Never, here: a read or a disconnect moves this provider to
               `working`, which leaves this branch, so nothing inside it can be
               in flight. The controls come back with the answer. */
            busy={false}
          />
        </div>
      )}
      {attachedApple && (
        <div role="region" aria-label="An iCloud account">
          <Connected
            state={attachedApple}
            label="An iCloud calendar"
            keepTitles={keepTitles}
            onKeepTitles={onKeepTitles}
            onRefresh={() => void appleLink.refresh()}
            onDisconnect={() => void appleLink.disconnect()}
            busy={false}
          />
        </div>
      )}

      {!attached && (
        <p className="max-w-[62ch] text-sm text-ink-3">
          iCloud has no sign-in button to offer, so there are two ways in. One asks you to remember
          nothing and gives us a single calendar. The other is live for all of them and stays
          private.
        </p>
      )}

      <div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {attached ? 'Add the other way in' : 'Connect Apple Calendar'}
        </Button>
      </div>

      {failures.map((state) => (
        <p key={state.why} className="max-w-[58ch] text-sm text-danger">
          {FAILED[state.why]}
        </p>
      ))}
      {/* Same as the other providers: a link the server still holds needs a way
          out even while the dialog is where reconnecting happens. */}
      {(stillStored(sub) || stillStored(apple)) && (
        <div className="flex flex-wrap gap-2">
          {stillStored(sub) && (
            <Button variant="dangerQuiet" size="sm" onClick={() => void urlLink.disconnect()}>
              Disconnect the published link
            </Button>
          )}
          {stillStored(apple) && (
            <Button variant="dangerQuiet" size="sm" onClick={() => void appleLink.disconnect()}>
              Disconnect iCloud
            </Button>
          )}
        </div>
      )}

      {/**
       * An explicit key, because the siblings above it come and go.
       *
       * The error paragraphs and the way-out button appear and disappear with
       * the state, and React matches unkeyed children by position: a change in
       * how many render before this one is enough for it to reconcile the
       * dialog as a different element and remount its whole subtree. That reads
       * as the form resetting itself mid-typing, and to a driver waiting for a
       * button to hold still it reads as an element that keeps detaching.
       */}
      <Dialog key="apple-ways" open={open} onOpenChange={setOpen}>
        {/**
           * `scrollbar-gutter: stable` is not a nicety here.
           *
           * A centred dialog with a max height and `overflow-y-auto` oscillates
           * when its content crosses that height: the scrollbar appears, the
           * content narrows, the text reflows, the height changes, the scrollbar
           * goes — and the whole box, translated by half its own height, moves
           * with it. It reads as a shimmer and it made a submit button
           * permanently unclickable to Playwright, which waits for an element to
           * be still and gave up after thirty seconds. Reserving the gutter
           * settles it.
           */}
        <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-scroll [scrollbar-gutter:stable]">
          <DialogHeader>
            <DialogTitle>Connect Apple Calendar</DialogTitle>
            <DialogDescription>
              Two ways in, and they are not the same trade. Open the one you want.
            </DialogDescription>
          </DialogHeader>
          <AppleWays appleLink={appleLink} urlLink={urlLink} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
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
