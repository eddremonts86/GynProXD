import { useState } from 'react'
import { ArrowsClockwise, Sparkle } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Panel } from '@/ui/Panel'
import { activeProfile } from '@/lib/profiles'
import { anythingBuilt } from '@/lib/member-plan'
import { proStateOf, refreshEntitlement, type ProState } from '@/lib/entitlement'
import { serverCapabilities } from '@/lib/capabilities'
import { PRO_LOOKUP_KEY, PRO_PRICE } from '@/lib/member-plan'
import { startCheckout } from '@/lib/sync'
import { useSession } from '@/store/useSession'

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
  /**
   * Whether there is an account comes from the session store, not from
   * localStorage. Reading it straight off disk was correct and silent: nothing
   * re-renders on a localStorage write, so creating an account in the panel
   * above left this one still telling somebody to go and create one.
   *
   * The subscription state itself is still read from the cache on each render,
   * because the two things that change it both already cause one: `recheck`
   * below, and an unlock, which remounts the screen.
   */
  const link = useSession((s) => s.linked)
  const [busy, setBusy] = useState(false)
  const [checkout, setCheckout] = useState<string | null>(null)
  const [, forceRender] = useState(0)

  if (!profileId) return null
  const state = proStateOf(profileId)
  const caps = serverCapabilities()
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

  /**
   * Asks the server to open a Stripe checkout, and goes where it says.
   *
   * `startCheckout` is the gym panel's own call, reused rather than repeated: a
   * second fetch to the same route is a second place to get the body shape
   * wrong, and this one sends a *lookup key* rather than a price id for the
   * reason recorded there — a client that can name a price id can name any
   * price in the account, and on a shared Stripe account that is another
   * product's.
   *
   * The URL it returns is Stripe's own domain and the card is entered there.
   * There is no card field anywhere in this app, in any phase, and handing off
   * is the whole reason it never needs one.
   */
  const buy = async () => {
    if (busy) return
    setBusy(true)
    setCheckout(null)
    try {
      const url = await startCheckout(profileId, PRO_LOOKUP_KEY)
      if (url) window.location.assign(url)
      else setCheckout('Stripe could not open a checkout just now. Nothing was charged.')
    } finally {
      setBusy(false)
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
            {!anythingBuilt()
              ? 'Nothing is sold yet. This is here so an account can already tell you where it stands.'
              : caps.billing
                ? `Pro covers the day planner and what it draws on. EUR ${PRO_PRICE} a month, tax added at checkout, cancel any time.`
                : 'Pro covers the day planner and what it draws on. This server cannot take a card yet.'}
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
          <div className="flex flex-wrap items-center gap-2">
            {/**
             * Offered only when the server can actually take a card AND there is
             * something behind the subscription. Either one missing is a button
             * that asks for money and delivers nothing, which is the one thing
             * this panel has refused to do since it was a placeholder.
             */}
            {caps.billing && anythingBuilt() && !state.pro && (
              <Button variant="primary" onClick={() => void buy()} disabled={busy}>
                {busy ? 'Opening' : `Go Pro, EUR ${PRO_PRICE} a month`}
              </Button>
            )}
            {state.pro && caps.portal && (
              /* Stripe's own portal. Cancelling is legally theirs to get right
                 and we do not build a button for it. */
              <Button variant="secondary" onClick={() => window.location.assign(caps.portal!)}>
                Manage or cancel
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void recheck()} disabled={busy}>
              <ArrowsClockwise size={16} className={busy ? 'animate-spin' : undefined} />
              {busy ? 'Checking' : 'Check again'}
            </Button>
          </div>
        </div>
      )}

      {checkout && <p className="max-w-[62ch] text-sm text-ink-3">{checkout}</p>}
    </Panel>
  )
}
