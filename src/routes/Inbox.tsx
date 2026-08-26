import { useEffect } from 'react'
import { Link, Navigate } from '@tanstack/react-router'
import { BellSimpleSlash, Storefront } from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import { inboxFor } from '../lib/messages'
import { notificationsEnabled, notificationsSupported } from '../lib/notify'
import { MessageCard } from '@/components/message-card'
import { PageHeader } from '../ui/PageHeader'
import { Panel } from '../ui/Panel'

/** Everything the member's gym has sent them, newest first. */
export function InboxPage() {
  const profileId = useSession((s) => s.profileId)
  const gym = useSession((s) => s.gym)
  const role = useSession((s) => s.role)
  const messages = useMessages((s) => s.messages)
  const markRead = useMessages((s) => s.markRead)
  const respond = useMessages((s) => s.respond)
  const toggleSaved = useMessages((s) => s.toggleSaved)

  const me = profileId ? { id: profileId, gym: gym ?? undefined } : null
  const inbox = me ? inboxFor(messages, me) : []
  const unreadIds = me ? inbox.filter((m) => !m.readBy.includes(me.id)).map((m) => m.id) : []

  /* Seen is read: opening the inbox clears the badge, card by card. */
  useEffect(() => {
    if (me && unreadIds.length > 0) markRead(unreadIds, me.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.join(','), me?.id])

  const quiet = notificationsSupported() && !notificationsEnabled()

  /* Operators never receive broadcasts; their surface is the panel. */
  if (role === 'gym') return <Navigate to="/gym" />

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <PageHeader
        title="Inbox"
        description={
          gym
            ? `Events, menus and offers from ${gym}.`
            : 'Messages from your gym land here.'
        }
      />

      {quiet && inbox.length > 0 && (
        <p className="flex items-center gap-2 text-2xs text-ink-3">
          <BellSimpleSlash size={14} />
          System notifications are off — turn them on in Settings to hear about new messages.
        </p>
      )}

      {inbox.length === 0 ? (
        <Panel padding="lg" className="flex flex-col items-start gap-3">
          <Storefront size={22} className="text-ink-3" />
          {gym ? (
            <p className="max-w-[52ch] text-sm text-ink-3">
              Nothing from {gym} yet. When they publish an event, a menu or an offer, it shows
              up here.
            </p>
          ) : (
            <p className="max-w-[52ch] text-sm text-ink-3">
              You train independently, so there is no gym to hear from. Pick one under{' '}
              <Link to="/settings" className="text-brand underline underline-offset-2">
                Settings
              </Link>{' '}
              and its messages will land here.
            </p>
          )}
        </Panel>
      ) : (
        <div className="flex flex-col gap-4">
          {inbox.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              viewer={me?.id}
              unread={unreadIds.includes(m.id)}
              onRsvp={(answer) => me && respond(m.id, me.id, answer)}
              onToggleSave={() => me && toggleSaved(m.id, me.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
