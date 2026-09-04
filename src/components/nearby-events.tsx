import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowSquareOut, MapPin, Plus } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { EmptyState } from '@/ui/EmptyState'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { Section, SECTION_ACTION } from '@/ui/PageHeader'
import { Tag } from '@/ui/Tag'
import { Bar } from '@/components/route-skeleton'
import { formatShortDate } from '@/lib/labels'
import type { NearbyEvent } from '@/lib/nearby-events'
import type { Outing, Place } from '@/lib/life-profile'
import type { NearbyState } from '@/hooks/use-nearby-events'

/**
 * A strip of what is on near them, under the day.
 *
 * Cards in a row that scrolls sideways, one per event, and every card has the
 * same three facts in the same places: when, what, where. A tap on one puts
 * it on the day as an outing; the day draws it as an event with a link to the
 * tickets, and the same card then says so and offers to take it off.
 *
 * The idle state says what leaves the device before asking for anything, in
 * plain words: a five kilometre cell, or a city typed by hand. Ticketed events
 * only, because that is what the source has, and the hint says so rather than
 * letting an empty strip imply an empty town.
 */

const SPRING = { type: 'spring', stiffness: 100, damping: 20 } as const

const FAILED: Record<Exclude<NearbyState, { kind: 'idle' | 'locating' | 'busy' | 'done' }>['why'], string> = {
  'no-position': 'This device did not give its position. Name a city instead.',
  'no-source': 'No events source on this server.',
  refused: 'Part of Pro, and this account is not.',
  unreachable: 'The events source could not be reached.',
  unreadable: 'The answer did not make sense and was not used.',
}

function CityForm({ onCity }: { onCity: (city: string) => void }) {
  const [typed, setTyped] = useState('')
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        onCity(typed)
      }}
    >
      <div className="w-56">
        <Input
          label="Or a city"
          placeholder="Lisboa, Berlin, Sevilla"
          value={typed}
          maxLength={60}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
      <Button type="submit" variant="ghost" disabled={typed.trim().length < 2}>
        Look there
      </Button>
    </form>
  )
}

function Card({
  event,
  index,
  onDay,
  still,
  onAdd,
  onRemove,
}: {
  event: NearbyEvent
  index: number
  onDay: boolean
  still: boolean
  onAdd: (event: NearbyEvent) => void
  onRemove: (id: string) => void
}) {
  const where = [event.venue, event.city].filter(Boolean).join(', ')
  return (
    <motion.li
      className="w-64 shrink-0 snap-start"
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING, delay: still ? 0 : index * 0.05 }}
    >
      <Panel
        tone="quiet"
        padding="md"
        className="flex h-full flex-col gap-2.5 transition-transform duration-150 hover:-translate-y-px"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="num text-2xs text-ink-3">
            {formatShortDate(event.date)}
            {event.time ? ` · ${event.time}` : ''}
          </span>
          {event.segment && <Tag tone="outline">{event.segment}</Tag>}
        </div>
        <p className="line-clamp-2 text-sm leading-snug font-medium text-ink">{event.name}</p>
        <p className="truncate text-2xs text-ink-3">{where || 'Venue not given'}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
          {onDay ? (
            <>
              <Tag tone="neutral">On your day</Tag>
              <Button variant="ghost" size="xs" onClick={() => onRemove(event.id)}>
                Take it off
              </Button>
            </>
          ) : event.time ? (
            <Button variant="secondary" size="xs" onClick={() => onAdd(event)}>
              <Plus size={12} weight="bold" />
              Add to my day
            </Button>
          ) : (
            <span className="text-2xs text-ink-3">No time given</span>
          )}
          {event.url && (
            <a href={event.url} target="_blank" rel="noreferrer" className={SECTION_ACTION}>
              Tickets
              <ArrowSquareOut size={12} />
            </a>
          )}
        </div>
      </Panel>
    </motion.li>
  )
}

export function NearbyEvents({
  state,
  place,
  offered,
  outings,
  onLocate,
  onCity,
  onForget,
  onRetry,
  onAdd,
  onRemove,
}: {
  state: NearbyState
  place: Place | null
  offered: boolean
  outings: readonly Outing[]
  onLocate: () => void
  onCity: (city: string) => void
  onForget: () => void
  onRetry: () => void
  onAdd: (event: NearbyEvent) => void
  onRemove: (id: string) => void
}) {
  const still = useReducedMotion() === true
  if (!offered) return null

  const onDay = new Set(outings.map((o) => o.id))
  const hint =
    state.kind === 'done'
      ? place?.geo
        ? `ticketed, within 25 km, next two weeks`
        : `ticketed, around ${place?.label ?? 'there'}, next two weeks`
      : 'ticketed, next two weeks'

  return (
    <Section
      title="Near you"
      hint={hint}
      action={
        place ? (
          <Button variant="ghost" size="sm" onClick={onForget}>
            Somewhere else
          </Button>
        ) : undefined
      }
    >
      {(state.kind === 'idle' || state.kind === 'locating') && (
        <Panel padding="lg" className="flex flex-col gap-4">
          <p className="max-w-[62ch] text-sm text-ink-3">
            Concerts, matches and shows near you in the next two weeks, from Ticketmaster. Your
            position is rounded to a five kilometre cell before it leaves this device, and the cell
            is all that is sent.
          </p>
          <div className="flex flex-wrap items-end gap-4">
            <Button variant="secondary" onClick={onLocate} disabled={state.kind === 'locating'}>
              <MapPin size={16} />
              {state.kind === 'locating' ? 'Asking the device' : 'Use my location'}
            </Button>
            <CityForm onCity={onCity} />
          </div>
        </Panel>
      )}

      {state.kind === 'busy' && (
        <ul className="flex animate-pulse gap-3 overflow-hidden" aria-busy="true" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <li key={i} className="w-64 shrink-0">
              <Panel tone="quiet" padding="md" className="flex flex-col gap-2.5">
                <Bar className="h-3 w-24" />
                <Bar className="h-4 w-full" />
                <Bar className="h-3 w-32" />
                <Bar className="h-8 w-28" />
              </Panel>
            </li>
          ))}
          <li className="sr-only">Looking</li>
        </ul>
      )}

      {state.kind === 'done' && state.events.length === 0 && (
        <EmptyState
          title="Nothing ticketed near you"
          description="Nothing within 25 km in the next two weeks, from the one source there is. Try a city, or come back later."
        />
      )}

      {state.kind === 'done' && state.events.length > 0 && (
        <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
          {state.events.map((event, index) => (
            <Card
              key={event.id}
              event={event}
              index={index}
              still={still}
              onDay={onDay.has(event.id)}
              onAdd={onAdd}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}

      {state.kind === 'failed' && (
        <Panel padding="lg" className="flex flex-col items-start gap-3">
          <p className="max-w-[58ch] text-sm text-ink-3">{FAILED[state.why]}</p>
          <div className="flex flex-wrap items-end gap-4">
            {state.why !== 'refused' && state.why !== 'no-source' && state.why !== 'no-position' && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            {state.why === 'no-position' && <CityForm onCity={onCity} />}
          </div>
        </Panel>
      )}
    </Section>
  )
}
