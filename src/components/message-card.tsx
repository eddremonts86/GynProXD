import { Check, MapPin, X } from '@phosphor-icons/react'
import { TEMPLATE_LABELS, offerPayload, type GymMessage } from '@/lib/messages'
import { repsForDay, totalReps } from '@/lib/challenge'
import { exerciseById } from '@/lib/exercises'
import { MUSCLE_LABELS, formatShortDate } from '@/lib/labels'
import { ExerciseThumb } from '@/ui/ExerciseThumb'
import { Panel } from '@/ui/Panel'
import { Tag } from '@/ui/Tag'
import { Button } from '@/ui/Button'
import { QrCode } from '@/ui/QrCode'
import { MessageBody, MessageGallery } from '@/components/message-body'
import { cn } from '@/lib/utils'

const KIND_TONE = {
  announcement: 'neutral',
  event: 'brand',
  menu: 'good',
  offer: 'danger',
  challenge: 'brand',
  collection: 'good',
  product: 'brand',
} as const

/**
 * One gym message, rendered the same in the member inbox, the composer
 * preview and the gym's sent list. `viewer` switches the interactive
 * affordances (RSVP, save) on; without it the card is read-only.
 */
export function MessageCard({
  message,
  viewer,
  onRsvp,
  onToggleSave,
  onToggleJoin,
  unread,
  chrome = 'panel',
}: {
  message: GymMessage
  viewer?: string
  onRsvp?: (answer: 'yes' | 'no') => void
  onToggleSave?: () => void
  onToggleJoin?: () => void
  unread?: boolean
  /**
   * `bare` drops the card's own surface for a container that already has one —
   * the inbox reading pane. Nesting a panel inside a panel puts two borders
   * and two paddings around the same words.
   */
  chrome?: 'panel' | 'bare'
}) {
  const myRsvp = viewer ? message.rsvp[viewer] : undefined
  const savedByMe = viewer ? message.saved.includes(viewer) : false
  const joinedByMe = viewer ? (message.joined ?? []).includes(viewer) : false

  const Shell = chrome === 'bare' ? BareShell : PanelShell
  return (
    <Shell unread={unread}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2">
            <Tag tone={KIND_TONE[message.kind]}>{TEMPLATE_LABELS[message.kind]}</Tag>
            {unread && <Tag tone="brand">New</Tag>}
          </span>
          {/* One step above the body's largest heading. At `text-base` it was
              14px against a 17px `h4` inside its own body: the message title
              lost to a subheading of itself. */}
          <h3 className="text-lg leading-snug font-semibold text-ink">{message.title}</h3>
        </div>
        <span className="num shrink-0 text-2xs text-ink-3">
          {formatShortDate(message.createdAt.slice(0, 10))}
        </span>
      </div>

      {/* Picture first, then the words: the card is selling something, and the
          photograph is the part that does the selling. */}
      {message.images && message.images.length > 0 && (
        /* Held to the same measure as the body: a picture running wider than
           the sentences under it reads as two components, not one card. */
        <MessageGallery images={message.images} className="max-w-[68ch]" />
      )}

      {message.body && <MessageBody body={message.body} />}

      {message.kind === 'event' && message.event && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
            <span className="num font-medium text-ink">
              {formatShortDate(message.event.date)}
              {message.event.time ? ` · ${message.event.time}` : ''}
            </span>
            {message.event.place && (
              <span className="flex items-center gap-1 text-ink-3">
                <MapPin size={14} />
                {message.event.place}
              </span>
            )}
          </div>
          {viewer && onRsvp && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={myRsvp === 'yes' ? 'primary' : 'secondary'}
                onClick={() => onRsvp('yes')}
              >
                <Check size={14} weight="bold" />
                Going
              </Button>
              <Button
                size="sm"
                variant={myRsvp === 'no' ? 'primary' : 'secondary'}
                onClick={() => onRsvp('no')}
              >
                <X size={14} weight="bold" />
                Can't make it
              </Button>
              {myRsvp && (
                <span className="text-2xs text-ink-3">
                  {myRsvp === 'yes' ? 'See you there.' : 'Noted.'}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {message.kind === 'menu' && message.menu && (
        <dl className="flex flex-col gap-2">
          {message.menu.courses.map((course) => (
            <div key={course.name} className="flex flex-col gap-0.5 border-t border-line pt-2">
              <dt className="text-2xs font-medium tracking-wide text-ink-3 uppercase">
                {course.name}
              </dt>
              <dd className="text-sm text-ink-2">{course.dishes.join(' · ')}</dd>
            </div>
          ))}
        </dl>
      )}

      {message.kind === 'challenge' && message.challenge && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag tone="outline">
              {exerciseById(message.challenge.exerciseId)?.name ?? message.challenge.exerciseId}
            </Tag>
            <Tag tone="outline">{message.challenge.days} days</Tag>
            <Tag tone="outline">
              {message.challenge.start} →{' '}
              {repsForDay(message.challenge, message.challenge.days)} {message.challenge.unit}
            </Tag>
            <Tag tone="outline">
              {totalReps(message.challenge).toLocaleString('en-GB')} total
            </Tag>
          </div>
          {viewer && onToggleJoin && (
            <div>
              <Button
                size="sm"
                variant={joinedByMe ? 'primary' : 'secondary'}
                onClick={onToggleJoin}
              >
                {joinedByMe ? 'Joined' : 'Join challenge'}
              </Button>
            </div>
          )}
        </div>
      )}

      {message.kind === 'collection' && message.collection && (
        <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
          {message.collection.exerciseIds.map((id) => {
            const ex = exerciseById(id)
            return (
              <li key={id} className="flex items-center gap-2.5">
                {ex && <ExerciseThumb exercise={ex} size="sm" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{ex?.name ?? id}</span>
                  {ex && (
                    <span className="block text-2xs text-ink-3">{MUSCLE_LABELS[ex.muscle]}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {message.kind === 'product' && message.product && (
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-lg font-semibold text-ink">{message.product.name}</span>
            {message.product.note && (
              <span className="max-w-[52ch] text-sm leading-relaxed text-ink-3">
                {message.product.note}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <span className="num text-2xl leading-none font-semibold text-ink">
              {message.product.price}
            </span>
            {viewer && onToggleSave && (
              <Button size="sm" variant={savedByMe ? 'primary' : 'secondary'} onClick={onToggleSave}>
                {savedByMe ? 'Reserved' : 'Reserve one'}
              </Button>
            )}
          </div>
        </div>
      )}

      {message.kind === 'offer' && message.offer && (
        <div className="flex flex-wrap items-center gap-4 border-t border-line pt-3">
          <QrCode
            value={offerPayload(message.offer.code, message.gym)}
            label={`Offer code ${message.offer.code}`}
            className="size-24 shrink-0"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-lg font-semibold text-ink">{message.offer.discount}</span>
            <span className="num text-sm tracking-widest text-ink-2">{message.offer.code}</span>
            {message.offer.validUntil && (
              <span className="num text-2xs text-ink-3">
                Valid until {formatShortDate(message.offer.validUntil)}
              </span>
            )}
            {viewer && onToggleSave && (
              <div className="pt-1">
                <Button size="sm" variant={savedByMe ? 'primary' : 'secondary'} onClick={onToggleSave}>
                  {savedByMe ? 'Saved' : 'Save offer'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Shell>
  )
}

function PanelShell({ children, unread }: { children: React.ReactNode; unread?: boolean }) {
  return (
    <Panel padding="lg" className={cn('flex flex-col gap-3', unread && 'ring-1 ring-brand/40')}>
      {children}
    </Panel>
  )
}

function BareShell({ children }: { children: React.ReactNode; unread?: boolean }) {
  return <div className="flex flex-col gap-3">{children}</div>
}
