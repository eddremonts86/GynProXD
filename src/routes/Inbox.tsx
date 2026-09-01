import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  BellSimpleSlash,
  Envelope,
  EnvelopeOpen,
  ForkKnife,
  Storefront,
  Trash,
} from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import { useGym } from '../store/useGym'
import { HOUSE_GYM, inboxFor, senderOf } from '../lib/messages'
import { notificationsEnabled, notificationsSupported } from '../lib/notify'
import { useMenus } from '../store/useMenus'
import { menuFor } from '../lib/menu'
import { formatLongDate, pluralize } from '../lib/labels'
import { Button } from '../ui/Button'
import { MessageCard } from '@/components/message-card'
import { InboxList } from '@/components/inbox-list'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'
import { cn } from '@/lib/utils'

/**
 * Everything a member has been sent, as a list you scan and a message you read.
 *
 * It used to be a column of full cards. That was fine while a gym only ever
 * published one-line announcements and stopped being fine the moment the same
 * column had to hold a menu with four courses and three photographs, an offer
 * with a QR code, and a closure notice — each sizing itself, so finding
 * anything meant scrolling past everything.
 *
 * So: rows of a fixed height for scanning, one message opened wide for
 * reading. Which also makes read and unread mean something, because a message
 * is now marked read when somebody opens it rather than when the page mounts.
 * The badge stops being a thing that clears itself as you walk past.
 */
export function InboxPage() {
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const role = useSession((s) => s.role)
  const messages = useMessages((s) => s.messages)
  const markRead = useMessages((s) => s.markRead)
  const setRemoved = useMessages((s) => s.setRemoved)
  const setUnread = useMessages((s) => s.setUnread)
  const respond = useMessages((s) => s.respond)
  const toggleSaved = useMessages((s) => s.toggleSaved)
  const toggleJoined = useMessages((s) => s.toggleJoined)
  const startChallenge = useGym((s) => s.startChallenge)
  const menus = useMenus((s) => s.menus)
  const navigate = useNavigate()
  const { m: openId } = useSearch({ from: '/inbox' })
  const gymMenu = menuFor(menus, gym ?? undefined)

  /* The last thing removed, so it can be put back. A member cannot delete the
     gym's row and should not be able to, so an accidental Remove has nowhere
     to be recovered from except here. */
  const [undoId, setUndoId] = useState<string | null>(null)
  const undoTimer = useRef<number>(0)

  useEffect(() => () => window.clearTimeout(undoTimer.current), [])

  const me = profileId ? { id: profileId, gym: gym ?? undefined } : null
  const inbox = me ? inboxFor(messages, me) : []
  const open = openId ? inbox.find((message) => message.id === openId) : undefined
  const unreadTotal = me ? inbox.filter((x) => !x.readBy.includes(me.id)).length : 0

  /* Read on open, not on arrival. */
  useEffect(() => {
    if (me && open && !open.readBy.includes(me.id)) markRead([open.id], me.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, me?.id])

  /* A link to a message that has since been removed, or belongs to somebody
     else, should not leave the pane pointing at nothing. */
  useEffect(() => {
    if (openId && !open) void navigate({ to: '/inbox', search: {}, replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, open?.id])

  const select = (id: string) => void navigate({ to: '/inbox', search: { m: id } })
  const close = () => void navigate({ to: '/inbox', search: {} })

  const remove = (id: string) => {
    if (!me) return
    setRemoved(id, me.id, true)
    if (id === openId) close()
    setUndoId(id)
    window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndoId(null), 8000)
  }

  const undo = () => {
    if (!me || !undoId) return
    setRemoved(undoId, me.id, false)
    setUndoId(null)
  }

  const quiet = notificationsSupported() && !notificationsEnabled()

  /* Operators never receive broadcasts; their surface is the panel. */
  if (role === 'gym') return <Navigate to="/gym" />

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Inbox"
        description={
          gym
            ? `Events, menus, offers and challenges from ${gym}, and from ${HOUSE_GYM}.`
            : `Events, offers and challenges from ${HOUSE_GYM}. Join a gym and theirs land here too.`
        }
        hint={
          inbox.length > 0
            ? unreadTotal > 0
              ? `${unreadTotal} unread of ${inbox.length}`
              : `${pluralize(inbox.length, 'message')}, all read`
            : undefined
        }
        action={
          gymMenu ? (
            <Button variant="secondary" size="sm" onClick={() => navigate({ to: '/menu' })}>
              <ForkKnife size={15} />
              Gym menu
            </Button>
          ) : undefined
        }
      />

      {quiet && inbox.length > 0 && (
        <p className="flex items-center gap-2 text-2xs text-ink-3">
          <BellSimpleSlash size={14} />
          System notifications are off — turn them on in Settings to hear about new messages.
        </p>
      )}

      {undoId && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-line px-3 py-2.5">
          <p className="flex-1 text-2xs leading-relaxed text-ink-2">
            Removed from your inbox on this device. The gym still has its copy.
          </p>
          <Button variant="secondary" size="sm" onClick={undo}>
            Undo
          </Button>
        </div>
      )}

      {inbox.length === 0 ? (
        <EmptyInbox gym={gym} />
      ) : (
        /* Unequal on purpose: the list is for recognising a message, the pane is
           for reading one. On a narrow screen only one of the two is shown,
           because a reading pane 40 characters wide is not a reading pane. */
        /* `minmax(0,...)` on every track, not `1fr`. A grid column defaults to
           `auto`, which sizes to max-content — so the single mobile column grew
           to 4708px to fit a preview line that could then never truncate,
           because truncation needs a bounded width and the bound was the thing
           being computed. It reads as an overflowing list; it is a missing
           minimum. */
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)] md:items-start">
          <div
            className={cn(
              'min-w-0 md:sticky md:top-4',
              open && 'hidden md:block',
            )}
          >
            {me && (
              <InboxList
                messages={inbox}
                viewer={me.id}
                selectedId={open?.id}
                onSelect={select}
                onRemove={remove}
              />
            )}
          </div>

          {open && me ? (
            <Panel padding="lg" className="flex min-w-0 flex-col gap-4">
              {/* Reversed rather than duplicated. Three actions and a sender
                  line do not fit across 375px, so on a phone the actions take
                  their own row above and the sender sits under them; on a wide
                  screen it is one row with the sender on the left. The markup
                  is the same either way, which is why the two cannot drift. */}
              <div className="flex flex-col-reverse gap-2 border-b border-line pb-3 md:flex-row md:items-center md:justify-between">
                <span className="min-w-0 text-2xs text-ink-3">
                  {senderOf(open)} ·{' '}
                  <span className="num">{formatLongDate(open.createdAt.slice(0, 10))}</span>
                </span>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={close}
                    className="mr-auto -ml-2 md:hidden"
                  >
                    <ArrowLeft size={15} />
                    Back
                  </Button>
                  {/* "I have not dealt with this yet" — the reason email kept
                      this button. It only changes what this device shows: the
                      gym was already told the message was opened, and that
                      stays true. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setUnread(open.id, me.id)
                      close()
                    }}
                  >
                    <Envelope size={15} />
                    Mark unread
                  </Button>
                  <Button variant="dangerQuiet" size="sm" onClick={() => remove(open.id)}>
                    <Trash size={15} />
                    Remove
                  </Button>
                </div>
              </div>

              <MessageCard
                message={open}
                viewer={me.id}
                chrome="bare"
                onRsvp={(answer) => respond(open.id, me.id, answer)}
                onToggleSave={() => toggleSaved(open.id, me.id)}
                onToggleJoin={() => {
                  if (!open.challenge) return
                  /* Joined already? The button is a doorway, not an undo. */
                  if ((open.joined ?? []).includes(me.id)) {
                    void navigate({ to: '/challenges' })
                    return
                  }
                  startChallenge(open.challenge)
                  toggleJoined(open.id, me.id)
                }}
              />
            </Panel>
          ) : (
            /* Nothing is selected on purpose: auto-opening the newest message
               would mark it read before anybody had looked at it, which is the
               behaviour this screen was rebuilt to stop. */
            <Panel
              tone="quiet"
              padding="lg"
              className="hidden min-h-72 min-w-0 flex-col items-center justify-center gap-3 text-center md:flex"
            >
              <EnvelopeOpen size={22} className="text-ink-3" />
              <p className="max-w-[36ch] text-2xs leading-relaxed text-ink-3">
                Pick a message on the left. Arrow keys move through the list, Backspace removes the
                open one.
              </p>
            </Panel>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyInbox({ gym }: { gym: string | null }) {
  return (
    <Panel padding="lg" className="flex flex-col items-start gap-3">
      <Storefront size={22} className="text-ink-3" />
      {gym ? (
        <p className="max-w-[52ch] text-sm text-ink-3">
          Nothing from {gym} or {HOUSE_GYM} yet. When either publishes an event, a menu or an offer,
          it shows up here.
        </p>
      ) : (
        <p className="max-w-[52ch] text-sm text-ink-3">
          {`Nothing from ${HOUSE_GYM} yet, and no gym to hear from either. Pick one under `}
          <Link to="/settings" className="text-brand underline underline-offset-2">
            Settings
          </Link>{' '}
          and its messages land here beside ours.
        </p>
      )}
    </Panel>
  )
}
