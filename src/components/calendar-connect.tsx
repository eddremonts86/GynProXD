import { ArrowsClockwise, CalendarCheck, LinkSimple } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Panel'
import { Switch } from '@/components/ui/switch'
import { formatShortDate } from '@/lib/labels'
import type { LinkState } from '@/hooks/use-calendar-link'

/**
 * Connecting a real calendar, and what that costs, in the same panel.
 *
 * The sentence above the button is the point of this component. Everything else
 * in this app keeps a member's data on their device; this one asks them to let
 * a server hold a credential that can read their diary until they take it back.
 * That is a real trade and it is stated in the words somebody would use, not in
 * a link to a policy: read-only, three weeks, titles off unless asked, and one
 * button that ends it.
 */

const FAILED: Record<Exclude<LinkState, { kind: 'off' | 'checking' | 'disconnected' | 'connected' | 'working' }>['why'], string> = {
  'no-account': 'This profile has no sync account, and a calendar belongs to one.',
  unavailable: 'This server cannot connect a calendar.',
  refused: 'Part of Pro, and this account is not.',
  'not-connected': 'No calendar is connected to this account.',
  withdrawn: 'The connection was withdrawn at Google. Connect it again.',
  unreachable: 'Google could not be reached. Nothing on your day changed.',
}

function whenSynced(iso: string | null): string {
  if (!iso) return 'not read yet'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return 'not read yet'
  const day = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
  return `read ${formatShortDate(day)}, ${time}`
}

export function CalendarConnect({
  state,
  offered,
  keepTitles,
  onKeepTitles,
  onConnect,
  onRefresh,
  onDisconnect,
}: {
  state: LinkState
  offered: boolean
  keepTitles: boolean
  onKeepTitles: (next: boolean) => void
  onConnect: () => void
  onRefresh: () => void
  onDisconnect: () => void
}) {
  if (!offered) return null
  const busy = state.kind === 'working' || state.kind === 'checking'

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      {state.kind !== 'connected' && (
        <p className="max-w-[62ch] text-sm text-ink-3">
          Connect Google Calendar and the next three weeks of it shape your day, refreshed when you
          ask. Our server keeps a key that can read your calendar until you disconnect it, and
          nothing else: it may only read, it never writes, and event titles stay off your device
          unless you turn them on.
        </p>
      )}

      {state.kind === 'connected' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarCheck size={18} className="text-ink-2" />
            <span className="text-sm text-ink">
              {state.status.account || 'A Google calendar'}
            </span>
            <span className="num text-2xs text-ink-3">{whenSynced(state.status.lastSynced)}</span>
          </div>
          {state.pulled !== null && (
            <p className="text-sm text-ink-3">
              {state.pulled === 0
                ? 'Nothing in the next three weeks that blocks time.'
                : state.pulled === 1
                  ? '1 block on your days, from your calendar.'
                  : `${state.pulled} blocks on your days, from your calendar.`}
            </p>
          )}
          <label className="flex items-center gap-2 text-2xs text-ink-3">
            <Switch aria-label="Keep the titles" checked={keepTitles} onCheckedChange={onKeepTitles} />
            Keep the titles on this device
          </label>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {state.kind === 'connected' ? (
          <>
            <Button variant="secondary" onClick={onRefresh} disabled={busy}>
              <ArrowsClockwise size={16} />
              Read it again
            </Button>
            <Button variant="dangerQuiet" size="sm" onClick={onDisconnect} disabled={busy}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onConnect} disabled={busy}>
            <LinkSimple size={16} />
            {busy ? 'One moment' : 'Connect Google Calendar'}
          </Button>
        )}
      </div>

      {state.kind === 'failed' && (
        <p className="max-w-[58ch] text-sm text-danger">{FAILED[state.why]}</p>
      )}
    </Panel>
  )
}
