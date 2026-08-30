import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Check, MapPin, Storefront, Tag as TagIcon, X } from '@phosphor-icons/react'
import { useNavigate } from '@tanstack/react-router'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import { dismissNotice, dismissedNotices, noticesForToday } from '../lib/gym-notices'
import { formatShortDate } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { OVER_AURORA } from '../ui/AuroraTile'
import { SECTION_ACTION, Section } from '../ui/PageHeader'
import type { GymMessage } from '../lib/messages'
import { cn } from '@/lib/utils'

/**
 * What the gym is selling or running, on the home screen instead of behind the
 * bell. The gym pays for this app, so the two things a member can act on — an
 * event to attend, an offer to redeem — get the aurora material and a slot
 * directly under the day's training.
 *
 * The restraint that keeps it from reading as advertising: never more than two
 * cards, only while they can still be acted on, and every one of them can be
 * waved off for good. Nothing here interrupts, blocks or follows you into a
 * session.
 */

/** Controls sitting on the gradient: the palette's inks would vanish on it. */
const ON_AURORA =
  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold ' +
  'transition-[background-color,transform] duration-150 active:translate-y-px ' +
  'ring-1 ring-white/30 ring-inset'
const ON_AURORA_IDLE = 'bg-white/15 text-white hover:bg-white/25'
const ON_AURORA_ON = 'bg-white text-[#1d1d1a] hover:bg-white'

function DismissButton({ label, onDismiss }: { label: string; onDismiss: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onDismiss}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/15 hover:text-white"
    >
      <X size={14} weight="bold" />
    </button>
  )
}

function NoticeCard({
  tone,
  eyebrowIcon,
  eyebrow,
  title,
  onDismiss,
  dismissLabel,
  children,
}: {
  tone: 'green' | 'orange'
  eyebrowIcon: React.ReactNode
  eyebrow: string
  title: string
  onDismiss: () => void
  dismissLabel: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'flex min-h-44 flex-col gap-4 rounded-xl p-5 shadow-[var(--shadow-tile)] md:p-6',
        tone === 'green' ? 'aurora-green' : 'aurora-orange',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex items-center gap-2 text-sm font-medium text-white', OVER_AURORA)}>
          {eyebrowIcon}
          {eyebrow}
        </span>
        <DismissButton label={dismissLabel} onDismiss={onDismiss} />
      </div>

      <h3 className={cn('max-w-[24ch] text-xl leading-snug font-semibold text-white', OVER_AURORA)}>
        {title}
      </h3>

      <div className="mt-auto flex flex-col gap-3">{children}</div>
    </div>
  )
}

/**
 * The sentinel id the setup prompt is dismissed under, so it can share the
 * per-profile dismissal list with real messages.
 */
const NO_GYM_PROMPT = 'prompt:no-gym'

/**
 * The same slot when there is no gym attached. A member who skipped the
 * optional gym field at sign-up was invisible to every gym forever and was
 * never asked again; this is the ask, once, where the gym's own content would
 * otherwise be. It costs no new space on the page and it goes away for good if
 * they wave it off.
 */
function NoGymYet({ profileId }: { profileId: string }) {
  const navigate = useNavigate()
  const [hidden, setHidden] = useState(() => dismissedNotices(profileId).includes(NO_GYM_PROMPT))
  if (hidden) return null

  return (
    <Section title="Your gym">
      <Panel padding="lg" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Storefront size={22} weight="regular" className="mt-0.5 shrink-0 text-ink-3" />
            <div className="flex flex-col gap-2">
              <p className="max-w-[62ch] text-sm text-ink-2">
                Add the gym you train at and its events, offers and daily menu arrive here instead
                of nowhere. They see your name on their member list; your training stays encrypted
                and never leaves this device.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Hide this"
            onClick={() => {
              dismissNotice(profileId, NO_GYM_PROMPT)
              setHidden(true)
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 transition-colors duration-150 hover:bg-surface-2 hover:text-ink"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <div>
          <Button variant="secondary" onClick={() => navigate({ to: '/settings' })}>
            Set your gym
            <ArrowRight size={16} weight="bold" />
          </Button>
        </div>
      </Panel>
    </Section>
  )
}

export function FromYourGym() {
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const messages = useMessages((s) => s.messages)
  const respond = useMessages((s) => s.respond)
  const toggleSaved = useMessages((s) => s.toggleSaved)

  /* Dismissals live on the device; mirroring them here keeps the card gone the
     moment it is waved off rather than on the next load. */
  const [hidden, setHidden] = useState<string[]>([])

  if (!profileId) return null
  if (!gym) return <NoGymYet profileId={profileId} />

  const picked = noticesForToday(messages, { id: profileId, gym }, todayIso())
  const event = picked.event && !hidden.includes(picked.event.id) ? picked.event : undefined
  const deal = picked.deal && !hidden.includes(picked.deal.id) ? picked.deal : undefined
  if (!event && !deal) return null

  const hide = (message: GymMessage) => {
    dismissNotice(profileId, message.id)
    setHidden((ids) => [...ids, message.id])
  }

  const myRsvp = event ? event.rsvp[profileId] : undefined
  const savedByMe = deal ? deal.saved.includes(profileId) : false

  return (
    <Section
      title={`From ${gym}`}
      action={
        <Link to="/inbox" className={SECTION_ACTION}>
          All messages
        </Link>
      }
    >
      <div className={cn('grid gap-4', event && deal && 'lg:grid-cols-2')}>
        {event && event.event && (
          <NoticeCard
            tone="green"
            eyebrowIcon={<Check size={16} weight="bold" />}
            eyebrow="Happening soon"
            title={event.title}
            dismissLabel={`Hide ${event.title}`}
            onDismiss={() => hide(event)}
          >
            <span
              className={cn(
                'flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white',
                OVER_AURORA,
              )}
            >
              <span className="num font-semibold">
                {formatShortDate(event.event.date)}
                {event.event.time ? ` · ${event.event.time}` : ''}
              </span>
              {event.event.place && (
                <span className="flex items-center gap-1">
                  <MapPin size={14} />
                  {event.event.place}
                </span>
              )}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => respond(event.id, profileId, 'yes')}
                className={cn(ON_AURORA, myRsvp === 'yes' ? ON_AURORA_ON : ON_AURORA_IDLE)}
              >
                <Check size={14} weight="bold" />
                Going
              </button>
              <button
                type="button"
                onClick={() => respond(event.id, profileId, 'no')}
                className={cn(ON_AURORA, myRsvp === 'no' ? ON_AURORA_ON : ON_AURORA_IDLE)}
              >
                Can&apos;t make it
              </button>
            </div>
          </NoticeCard>
        )}

        {deal && deal.offer && (
          <NoticeCard
            tone="orange"
            eyebrowIcon={<TagIcon size={16} weight="bold" />}
            eyebrow="Members' offer"
            title={deal.offer.discount}
            dismissLabel={`Hide ${deal.title}`}
            onDismiss={() => hide(deal)}
          >
            <span className={cn('flex flex-col gap-1 text-white', OVER_AURORA)}>
              <span className="num text-lg tracking-widest">{deal.offer.code}</span>
              <span className="num text-xs text-white/85">
                {deal.offer.validUntil
                  ? `Show this at the desk until ${formatShortDate(deal.offer.validUntil)}`
                  : 'Show this at the desk'}
              </span>
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSaved(deal.id, profileId)}
                className={cn(ON_AURORA, savedByMe ? ON_AURORA_ON : ON_AURORA_IDLE)}
              >
                {savedByMe ? 'Saved' : 'Save offer'}
              </button>
              <Link to="/inbox" className={cn(ON_AURORA, ON_AURORA_IDLE)}>
                Show the code
              </Link>
            </div>
          </NoticeCard>
        )}

        {deal && deal.product && (
          <NoticeCard
            tone="orange"
            eyebrowIcon={<Storefront size={16} weight="bold" />}
            eyebrow="New in the shop"
            title={deal.product.name}
            dismissLabel={`Hide ${deal.title}`}
            onDismiss={() => hide(deal)}
          >
            <span className={cn('flex items-baseline gap-2 text-white', OVER_AURORA)}>
              <span className="num text-3xl leading-none font-semibold">{deal.product.price}</span>
              <span className="text-sm text-white/85">&euro;</span>
              {deal.product.note && (
                <span className="ml-1 max-w-[28ch] text-xs text-white/85">{deal.product.note}</span>
              )}
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSaved(deal.id, profileId)}
                className={cn(ON_AURORA, savedByMe ? ON_AURORA_ON : ON_AURORA_IDLE)}
              >
                {savedByMe ? 'Reserved at the desk' : 'Reserve one'}
              </button>
            </div>
          </NoticeCard>
        )}
      </div>
    </Section>
  )
}
