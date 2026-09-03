import { useState } from 'react'
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Panel'
import { activeProfile } from '@/lib/profiles'
import { anythingBuilt } from '@/lib/member-plan'
import { proStateOf, refreshEntitlement, type ProState } from '@/lib/entitlement'
import { readSyncLink } from '@/lib/sync'

/**
 * What this account is subscribed to, next to sync because that is where an
 * account is already a thing somebody is thinking about.
 *
 * There is no button to buy anything, and that is the honest state rather than
 * an omission: nothing behind Pro is built yet, so a price on screen would be
 * asking for money in exchange for a promise. `anythingBuilt()` is what keeps
 * that true by itself when the first feature ships instead of relying on
 * somebody remembering to come back here.
 *
 * The four states are worth spelling out separately because one of them is an
 * accusation if it is worded like the others. "We could not check" is not "you
 * have not paid", and a member on a plane deserves the first sentence.
 */
function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const at = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(at.getTime())) return null
  return at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function describe(state: ProState): { label: string; detail: string } {
  const until = formatDate(state.until)
  if (state.reason === 'active') {
    return {
      label: 'Pro',
      detail: until ? `Paid up to ${until}.` : 'Active.',
    }
  }
  if (state.reason === 'grace') {
    return {
      label: 'Pro',
      detail: until
        ? `Your last confirmed date was ${until}. This device has not been able to reach the server since, so Pro stays on for now.`
        : 'This device has not been able to reach the server, so Pro stays on for now.',
    }
  }
  if (state.reason === 'unknown') {
    return {
      label: 'Not checked',
      detail: 'This device has not asked the server about this account yet.',
    }
  }
  return {
    label: 'Free',
    detail: until ? `Pro ran to ${until} and has not been renewed.` : 'This account is not on Pro.',
  }
}

export function ProSection() {
  const profileId = activeProfile()?.id ?? null
  const [busy, setBusy] = useState(false)
  const [, forceRender] = useState(0)

  if (!profileId) return null
  const link = readSyncLink(profileId)
  const state = proStateOf(profileId)
  const { label, detail } = describe(state)

  const recheck = async () => {
    if (busy) return
    setBusy(true)
    try {
      await refreshEntitlement(profileId)
    } finally {
      setBusy(false)
      forceRender((n) => n + 1)
    }
  }

  return (
    /* A named region, unlike the panels around it: the state in here is the one
       thing on this page a walk has to be able to read without counting divs,
       and a landmark is the accessible way to say "this box is about that
       heading" rather than a test id nothing else in the app uses. */
    <Panel
      padding="lg"
      className="flex flex-col gap-4"
      role="region"
      aria-labelledby="subscription-heading"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="subscription-heading"
          className="flex items-center gap-2 text-base font-semibold text-ink"
        >
          <Sparkle size={18} />
          Subscription
        </h2>
        {!link ? (
          <p className="max-w-[62ch] text-sm text-ink-3">
            A subscription belongs to a sync account, so it can follow you between devices. Set one
            up above first.
          </p>
        ) : (
          <p className="max-w-[62ch] text-sm text-ink-3">
            {anythingBuilt()
              ? 'Pro covers the day planner and what it draws on.'
              : 'Nothing is sold yet. This is here so an account can already tell you where it stands.'}
          </p>
        )}
      </div>

      {link && (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-2xs text-ink-3">This account</span>
            <span className="text-lg text-ink">{label}</span>
            <p className="max-w-[52ch] text-sm text-ink-3">{detail}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void recheck()} disabled={busy}>
            <ArrowsClockwise size={16} className={busy ? 'animate-spin' : undefined} />
            {busy ? 'Checking' : 'Check again'}
          </Button>
        </div>
      )}
    </Panel>
  )
}
