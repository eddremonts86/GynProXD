import { useEffect, useState } from 'react'
import { ArrowRight, Receipt } from '@phosphor-icons/react'
import { Panel } from '@/ui/Panel'
import { Button } from '@/ui/Button'
import { Tag } from '@/ui/Tag'
import { activeProfile } from '@/lib/profiles'
import { billingFor, startCheckout, type Billing } from '@/lib/sync'
import { ENTERPRISE_GYMS, PRICES, type GymPlan } from '@/lib/gym-plan'
import { cn } from '@/lib/utils'

/**
 * What this gym pays, and the one button that changes it.
 *
 * Shown to the owner only, because that is who the server lets start a
 * subscription and who Stripe bills. An operator who is not the owner is not
 * offered a button that would say no, which is the same rule the roster
 * follows.
 *
 * The plan comes from the gym's own row, not from here: this panel offers to
 * change it and never decides it. Every gate in the app keeps reading
 * `gyms.plan`, so what a person sees enabled tonight is what the webhook last
 * wrote, and a Stripe outage cannot take a paid feature away mid-session.
 */

/** Lookup keys, which is what the server's allowlist matches. Never price ids. */
const OFFERS = [
  {
    price: 'enf_sub_plus_eur_month',
    name: 'Plus',
    amount: PRICES.plus,
    line: 'The kitchen, programmes signed by your gym, the open door, scheduling, staff and your colour.',
  },
  {
    price: 'enf_sub_enterprise_eur_month',
    name: 'Enterprise',
    amount: PRICES.enterprise,
    line: `Everything Plus has, on up to ${ENTERPRISE_GYMS} rooms under this one account.`,
  },
] as const

/** Stripe's words, said the way somebody at a desk would say them. */
const SAID: Record<string, { tone: 'good' | 'danger' | 'neutral'; text: string }> = {
  active: { tone: 'good', text: 'Paid and running.' },
  trialing: { tone: 'good', text: 'On trial.' },
  past_due: {
    tone: 'danger',
    text: 'The last payment did not go through. Nothing has been switched off; the card is being retried.',
  },
  unpaid: { tone: 'danger', text: 'Unpaid, so the paid surfaces are off. Nothing was deleted.' },
  canceled: { tone: 'danger', text: 'Cancelled, so the paid surfaces are off. Nothing was deleted.' },
}

export function GymBilling({ plan }: { plan: GymPlan }) {
  const profileId = activeProfile()?.id ?? null
  const [billing, setBilling] = useState<Billing | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    void billingFor(profileId).then(setBilling)
  }, [profileId])

  /* Nothing at all until the server has said this account owns a gym: a
     billing panel on somebody else's desk is a question they cannot answer. */
  if (!profileId || !billing?.isOwner) return null

  const said = SAID[billing.status]
  /* Only what this gym does not already have. Offering Plus to a gym on Plus is
     a button whose honest label is "pay twice". */
  const offers = OFFERS.filter((o) => !(plan === 'plus' && o.name === 'Plus'))

  const go = async (price: string) => {
    setBusy(price)
    setError(null)
    const url = await startCheckout(profileId, price)
    if (!url) {
      setBusy(null)
      setError('Stripe could not be reached. Nothing was charged; try again in a moment.')
      return
    }
    /* Stripe's own page, in this tab. It comes back to /gym either way. */
    window.location.assign(url)
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Receipt size={16} className="text-ink-3" />
            What this gym pays
          </span>
          <span className="text-2xs leading-relaxed text-ink-3">
            {said?.text ??
              'Invoiced by hand at the moment. Starting a subscription here replaces that.'}
          </span>
        </span>
        <span className="flex items-center gap-2">
          <Tag tone="outline">
            {plan === 'plus' ? 'Plus' : 'Base'}
          </Tag>
          {said && <Tag tone={said.tone === 'good' ? 'brand' : 'outline'}>{billing.status}</Tag>}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {offers.map((offer) => (
          <li key={offer.price} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <span className="flex min-w-0 flex-col gap-1">
              <span className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-ink">{offer.name}</span>
                <span className="num text-xs text-ink-3">
                  &euro;{offer.amount} a month
                  {offer.name === 'Enterprise' ? `, up to ${ENTERPRISE_GYMS} rooms` : ', per gym'}
                </span>
              </span>
              <span className="max-w-[62ch] text-2xs leading-relaxed text-ink-3">{offer.line}</span>
            </span>
            <Button
              variant={offer.name === 'Plus' ? 'primary' : 'secondary'}
              onClick={() => void go(offer.price)}
              disabled={busy !== null}
              className={cn(busy === offer.price && 'opacity-70')}
            >
              {busy === offer.price ? 'Opening Stripe' : `Subscribe to ${offer.name}`}
              <ArrowRight size={16} weight="bold" />
            </Button>
          </li>
        ))}
      </ul>

      {error && <span className="text-2xs leading-relaxed text-danger">{error}</span>}
      <span className="max-w-[70ch] text-2xs leading-relaxed text-ink-3">
        Stripe takes the card; this app never sees one. Cancelling stops the paid surfaces and
        deletes nothing: your roster, your messages and everything your members did stay exactly
        where they are.
      </span>
    </Panel>
  )
}
