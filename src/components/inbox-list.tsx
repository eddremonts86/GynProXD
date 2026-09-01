import { useEffect, useRef } from 'react'
import { Trash } from '@phosphor-icons/react'
import { TEMPLATE_LABELS, previewOf, senderOf, type GymMessage } from '@/lib/messages'
import { formatShortDate } from '@/lib/labels'
import { isoDaysAgo, todayIso } from '@/lib/dates'
import { Tag } from '@/ui/Tag'
import { cn } from '@/lib/utils'

/**
 * The scanning half of the inbox.
 *
 * Every row is the same height whatever it holds, which is the whole point: a
 * gym publishes a one-line closure notice and a menu with four courses and
 * three photographs, and a list that let each one size itself turned scanning
 * into scrolling. What varies goes in the reading pane; what stays constant
 * lives here — who it is from, what kind of thing it is, its first line, and
 * whether it has been read.
 *
 * Grouped by age because that is the axis somebody actually searches on. They
 * do not remember the title; they remember it arrived yesterday.
 */
export function InboxList({
  messages,
  viewer,
  selectedId,
  onSelect,
  onRemove,
}: {
  messages: GymMessage[]
  viewer: string
  selectedId?: string
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)

  /* Keeps the open message in view when the selection moves by keyboard, and
     when a deep link opens the inbox on something far down the list. */
  useEffect(() => {
    if (!selectedId) return
    listRef.current
      ?.querySelector(`[data-message="${CSS.escape(selectedId)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  const move = (delta: number) => {
    const index = messages.findIndex((m) => m.id === selectedId)
    const next = index === -1 ? 0 : Math.min(messages.length - 1, Math.max(0, index + delta))
    const target = messages[next]
    if (target) onSelect(target.id)
  }

  return (
    <ul
      ref={listRef}
      /* One tab stop for the whole list, then arrows inside it — the way a
         list of many similar things is meant to be reached, rather than
         forty stops between the inbox and whatever follows it. */
      tabIndex={0}
      aria-label="Messages"
      className="flex flex-col divide-y divide-line overflow-y-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand md:max-h-[calc(100dvh-14rem)]"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'j') {
          e.preventDefault()
          move(1)
        } else if (e.key === 'ArrowUp' || e.key === 'k') {
          e.preventDefault()
          move(-1)
        } else if ((e.key === 'Backspace' || e.key === 'Delete') && selectedId) {
          e.preventDefault()
          onRemove(selectedId)
        }
      }}
    >
      {groupByDay(messages).map(([label, group]) => (
        <li key={label} className="flex flex-col">
          {/* Sticky so the day you are looking at is named even after you have
              scrolled past its heading. */}
          <h3 className="sticky top-0 z-1 border-b border-line bg-surface-2 px-3 py-1.5 text-2xs font-medium tracking-wide text-ink-3 uppercase">
            {label}
          </h3>
          <ul className="flex flex-col divide-y divide-line">
            {group.map((message) => (
              <Row
                key={message.id}
                message={message}
                viewer={viewer}
                selected={message.id === selectedId}
                onSelect={() => onSelect(message.id)}
                onRemove={() => onRemove(message.id)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function Row({
  message,
  viewer,
  selected,
  onSelect,
  onRemove,
}: {
  message: GymMessage
  viewer: string
  selected: boolean
  onSelect: () => void
  onRemove: () => void
}) {
  const unread = !message.readBy.includes(viewer)
  const thumb = message.images?.[0]
  const preview = previewOf(message)

  return (
    <li
      data-message={message.id}
      className={cn(
        'group relative flex items-start gap-3 px-3 py-2.5 transition-colors duration-150',
        selected ? 'bg-surface-2' : 'hover:bg-surface-2/60',
      )}
    >
      {/* A rule, not a ring: the selected row is a continuation of the reading
          pane beside it rather than a card that has floated up out of the list. */}
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-brand" />}

      <span
        aria-hidden
        className={cn(
          'mt-2 size-1.5 shrink-0 rounded-full',
          unread ? 'bg-brand' : 'bg-transparent',
        )}
      />

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 cursor-pointer text-left"
        aria-current={selected ? 'true' : undefined}
      >
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              'min-w-0 truncate text-2xs',
              unread ? 'font-medium text-ink-2' : 'text-ink-3',
            )}
          >
            {senderOf(message)}
          </span>
          <span className="num ml-auto shrink-0 text-2xs text-ink-3">
            {formatShortDate(message.createdAt.slice(0, 10))}
          </span>
        </span>

        <span
          className={cn(
            'mt-0.5 block truncate text-sm leading-snug',
            unread ? 'font-semibold text-ink' : 'text-ink-2',
          )}
        >
          {message.title}
        </span>

        <span className="mt-1 flex items-center gap-2">
          <Tag tone="outline" className="shrink-0">
            {TEMPLATE_LABELS[message.kind]}
          </Tag>
          {preview && (
            <span className="min-w-0 flex-1 truncate text-2xs text-ink-3">{preview}</span>
          )}
        </span>
        <span className="sr-only">{unread ? 'Unread' : 'Read'}</span>
      </button>

      {thumb && (
        <img
          src={thumb.url}
          alt=""
          loading="lazy"
          className="size-11 shrink-0 rounded-lg bg-surface-2 object-cover"
        />
      )}

      {/* Hidden until the row is under the pointer or the button is focused.
          Touch has no hover, which is why the reading pane carries a Remove of
          its own rather than this being the only way to reach it. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove "${message.title}" from your inbox`}
        className="shrink-0 cursor-pointer rounded-md p-1.5 text-ink-3 opacity-0 transition-opacity duration-150 hover:text-danger focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand group-hover:opacity-100 max-md:hidden"
      >
        <Trash size={15} />
      </button>
    </li>
  )
}

/**
 * Today, Yesterday, then coarse buckets. Newest group first.
 *
 * Per-day was the first attempt and it was wrong for this app's volume: a gym
 * publishes a handful of things a week, so seven messages produced six
 * headings and the grouping cost more rows than it saved. These buckets stay
 * roughly constant in number however much arrives, and the exact date is on
 * every row anyway — the heading is for orientation, not for lookup.
 */
function groupByDay(messages: GymMessage[]): [string, GymMessage[]][] {
  const today = todayIso()
  const yesterday = isoDaysAgo(1)
  const weekAgo = isoDaysAgo(7)
  const monthAgo = isoDaysAgo(30)
  const groups: [string, GymMessage[]][] = []

  for (const message of messages) {
    const day = message.createdAt.slice(0, 10)
    const label =
      day >= today
        ? 'Today'
        : day === yesterday
          ? 'Yesterday'
          : day >= weekAgo
            ? 'Earlier this week'
            : day >= monthAgo
              ? 'This month'
              : 'Older'
    const last = groups[groups.length - 1]
    if (last && last[0] === label) last[1].push(message)
    else groups.push([label, [message]])
  }
  return groups
}
