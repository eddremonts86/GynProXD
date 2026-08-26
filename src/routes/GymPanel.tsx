import { useMemo, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import {
  ArrowsClockwise,
  Check,
  PaperPlaneTilt,
  Plus,
  Trash,
  UsersThree,
} from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import {
  TEMPLATE_LABELS,
  makeOfferCode,
  sentBy,
  type GymMessage,
  type TemplateKind,
} from '../lib/messages'
import { listProfiles } from '../lib/profiles'
import { formatShortDate, pluralize } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { MessageCard } from '@/components/message-card'
import { Avatar } from '../ui/Avatar'
import { Button, IconButton } from '../ui/Button'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'
import { PageHeader, Section } from '../ui/PageHeader'
import { Tag } from '../ui/Tag'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CourseDraft {
  name: string
  dishes: string
}

const KINDS: TemplateKind[] = ['announcement', 'event', 'menu', 'offer']

/** The gym operator's desk: members, composer with templates, sent history. */
export function GymPanelPage() {
  const role = useSession((s) => s.role)
  const gym = useSession((s) => s.gym)
  const profileId = useSession((s) => s.profileId)

  if (role !== 'gym' || !gym || !profileId) {
    return <Navigate to={role === 'admin' ? '/admin' : '/'} />
  }
  return <GymDesk gym={gym} profileId={profileId} />
}

function GymDesk({ gym, profileId }: { gym: string; profileId: string }) {
  const messages = useMessages((s) => s.messages)
  const publish = useMessages((s) => s.publish)
  const remove = useMessages((s) => s.remove)

  const members = useMemo(
    () =>
      listProfiles().filter(
        (p) => p.id !== profileId && p.gym?.trim().toLowerCase() === gym.trim().toLowerCase(),
      ),
    [profileId, gym],
  )
  const sent = sentBy(messages, gym)

  /* Composer state. One draft at a time; publishing resets it. */
  const [kind, setKind] = useState<TemplateKind>('announcement')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventTime, setEventTime] = useState('')
  const [eventPlace, setEventPlace] = useState('')
  const [courses, setCourses] = useState<CourseDraft[]>([{ name: 'Lunch', dishes: '' }])
  const [discount, setDiscount] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [code, setCode] = useState(makeOfferCode)
  const [everyone, setEveryone] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const togglePicked = (id: string) => {
    setEveryone(false)
    setPicked((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
    setPublished(null)
  }

  const draft: GymMessage | null = useMemo(() => {
    if (!title.trim()) return null
    const common = {
      id: 'preview',
      gym,
      authorId: profileId,
      createdAt: new Date().toISOString(),
      kind,
      title: title.trim(),
      body: body.trim() || undefined,
      audience: 'all' as const,
      readBy: [],
      rsvp: {},
      saved: [],
    }
    if (kind === 'event') {
      if (!eventDate) return null
      return {
        ...common,
        event: { date: eventDate, time: eventTime || undefined, place: eventPlace.trim() || undefined },
      }
    }
    if (kind === 'menu') {
      const parsed = courses
        .map((c) => ({
          name: c.name.trim(),
          dishes: c.dishes.split('\n').map((d) => d.trim()).filter(Boolean),
        }))
        .filter((c) => c.name && c.dishes.length > 0)
      if (parsed.length === 0) return null
      return { ...common, menu: { courses: parsed } }
    }
    if (kind === 'offer') {
      if (!discount.trim()) return null
      return {
        ...common,
        offer: { discount: discount.trim(), validUntil: validUntil || undefined, code },
      }
    }
    return common
  }, [gym, profileId, kind, title, body, eventDate, eventTime, eventPlace, courses, discount, validUntil, code])

  const doPublish = () => {
    if (!draft) {
      setError(
        kind === 'event'
          ? 'An event needs a title and a date.'
          : kind === 'menu'
            ? 'A menu needs a title and at least one course with dishes.'
            : kind === 'offer'
              ? 'An offer needs a title and the discount.'
              : 'Give the message a title.',
      )
      return
    }
    if (!everyone && picked.length === 0) {
      setError('Pick at least one member, or send to everyone.')
      return
    }
    publish({
      gym,
      authorId: profileId,
      kind,
      title: draft.title,
      body: draft.body,
      audience: everyone ? 'all' : picked,
      event: draft.event,
      menu: draft.menu,
      offer: draft.offer,
    })
    const reach = everyone ? pluralize(members.length, 'member') : pluralize(picked.length, 'member')
    setPublished(`Published to ${reach}.`)
    setError(null)
    setTitle('')
    setBody('')
    setEventDate('')
    setEventTime('')
    setEventPlace('')
    setCourses([{ name: 'Lunch', dishes: '' }])
    setDiscount('')
    setValidUntil('')
    setCode(makeOfferCode())
    setEveryone(true)
    setPicked([])
  }

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setError(null)
    setPublished(null)
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Gym panel"
        description={`${gym} — reach your members with events, menus and offers.`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(15rem,0.42fr)]">
        <div className="flex flex-col gap-8">
          <Section title="New message">
            <Panel padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Template">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => touch(setKind)(k)}
                    className={cn(
                      'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
                      kind === k ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-3 hover:text-ink',
                    )}
                  >
                    {TEMPLATE_LABELS[k]}
                  </button>
                ))}
              </div>

              <Input
                label="Title"
                value={title}
                onChange={(e) => touch(setTitle)(e.target.value)}
                placeholder={
                  kind === 'event'
                    ? 'Open mat Saturday'
                    : kind === 'menu'
                      ? "Today's kitchen"
                      : kind === 'offer'
                        ? 'Bring-a-friend week'
                        : 'New opening hours'
                }
              />

              {kind !== 'menu' && (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="gym-body" className="text-2xs font-medium text-ink-3">
                    Message
                  </label>
                  <Textarea
                    id="gym-body"
                    value={body}
                    onChange={(e) => touch(setBody)(e.target.value)}
                    rows={3}
                    placeholder="Optional details."
                    className="border-line bg-surface text-sm"
                  />
                </div>
              )}

              {kind === 'event' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Input
                    label="Date"
                    type="date"
                    value={eventDate}
                    min={todayIso()}
                    onChange={(e) => touch(setEventDate)(e.target.value)}
                  />
                  <Input
                    label="Time"
                    type="time"
                    value={eventTime}
                    onChange={(e) => touch(setEventTime)(e.target.value)}
                  />
                  <Input
                    label="Place"
                    value={eventPlace}
                    onChange={(e) => touch(setEventPlace)(e.target.value)}
                    placeholder="Main floor"
                  />
                </div>
              )}

              {kind === 'menu' && (
                <div className="flex flex-col gap-3">
                  {courses.map((course, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`Course ${i + 1} name`}
                          value={course.name}
                          onChange={(e) =>
                            touch(setCourses)(
                              courses.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)),
                            )
                          }
                          placeholder="Course"
                          className="h-9"
                        />
                        {courses.length > 1 && (
                          <IconButton
                            aria-label={`Remove course ${i + 1}`}
                            onClick={() => touch(setCourses)(courses.filter((_, j) => j !== i))}
                          >
                            <Trash size={15} />
                          </IconButton>
                        )}
                      </div>
                      <Textarea
                        aria-label={`Course ${i + 1} dishes`}
                        value={course.dishes}
                        onChange={(e) =>
                          touch(setCourses)(
                            courses.map((c, j) => (j === i ? { ...c, dishes: e.target.value } : c)),
                          )
                        }
                        rows={2}
                        placeholder={'One dish per line'}
                        className="border-line bg-surface text-sm"
                      />
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => touch(setCourses)([...courses, { name: '', dishes: '' }])}
                  >
                    <Plus size={14} weight="bold" />
                    Add course
                  </Button>
                </div>
              )}

              {kind === 'offer' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Discount"
                    value={discount}
                    onChange={(e) => touch(setDiscount)(e.target.value)}
                    placeholder="20% off personal training"
                  />
                  <Input
                    label="Valid until"
                    type="date"
                    value={validUntil}
                    min={todayIso()}
                    onChange={(e) => touch(setValidUntil)(e.target.value)}
                  />
                  <div className="flex items-end gap-2 sm:col-span-2">
                    <Input label="Redemption code" value={code} readOnly className="num tracking-widest" />
                    <Button
                      variant="secondary"
                      aria-label="Generate a new code"
                      onClick={() => touch(setCode)(makeOfferCode())}
                    >
                      <ArrowsClockwise size={16} />
                      New code
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <span className="text-2xs font-medium text-ink-3">Send to</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEveryone(true)
                      setPicked([])
                      setPublished(null)
                    }}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                      everyone ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-3 hover:text-ink',
                    )}
                  >
                    <UsersThree size={15} />
                    Everyone ({members.length})
                  </button>
                  {members.map((m) => {
                    const on = !everyone && picked.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => togglePicked(m.id)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1 text-sm font-medium transition-colors',
                          on ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-3 hover:text-ink',
                        )}
                      >
                        <Avatar name={m.name} seed={m.id} size="sm" className="size-6 text-[9px]" />
                        {m.name}
                        {on && <Check size={13} weight="bold" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={doPublish}>
                  <PaperPlaneTilt size={16} />
                  Publish
                </Button>
                {error && <span className="text-2xs text-danger">{error}</span>}
                {published && (
                  <span role="status" className="text-2xs text-good">
                    {published}
                  </span>
                )}
              </div>
            </Panel>

            {draft && (
              <div className="flex flex-col gap-2">
                <span className="text-2xs font-medium text-ink-3">Preview — what members see</span>
                <MessageCard message={draft} />
              </div>
            )}
          </Section>

          <Section title="Sent" hint={pluralize(sent.length, 'message')}>
            {sent.length === 0 ? (
              <p className="text-sm text-ink-3">Nothing published yet. Your history lands here.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sent.map((m) => {
                  const going = Object.values(m.rsvp).filter((r) => r === 'yes').length
                  const declined = Object.values(m.rsvp).filter((r) => r === 'no').length
                  return (
                    <Panel key={m.id} padding="md" className="flex items-center gap-3">
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <Tag>{TEMPLATE_LABELS[m.kind]}</Tag>
                          <span className="truncate text-sm font-semibold text-ink">{m.title}</span>
                        </span>
                        <span className="num text-2xs text-ink-3">
                          {formatShortDate(m.createdAt.slice(0, 10))} ·{' '}
                          {m.audience === 'all' ? 'everyone' : pluralize(m.audience.length, 'member')} ·{' '}
                          read {m.readBy.length}
                          {m.kind === 'event' ? ` · going ${going} · declined ${declined}` : ''}
                          {m.kind === 'offer' ? ` · saved ${m.saved.length}` : ''}
                          {m.kind === 'offer' && m.offer ? ` · code ${m.offer.code}` : ''}
                        </span>
                      </div>
                      {confirmDelete === m.id ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              remove(m.id)
                              setConfirmDelete(null)
                            }}
                          >
                            Delete
                          </Button>
                        </span>
                      ) : (
                        <IconButton
                          aria-label={`Delete ${m.title}`}
                          onClick={() => setConfirmDelete(m.id)}
                        >
                          <Trash size={15} />
                        </IconButton>
                      )}
                    </Panel>
                  )
                })}
              </div>
            )}
          </Section>
        </div>

        <Section title="Members" hint={pluralize(members.length, 'member')}>
          <Panel padding="lg">
            {members.length === 0 ? (
              <p className="max-w-[40ch] text-sm text-ink-3">
                Nobody has picked {gym} yet. Members choose their gym when creating a profile, or
                later in Settings.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Avatar name={m.name} seed={m.id} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{m.name}</span>
                      <span className="num block text-2xs text-ink-3">
                        since {formatShortDate(m.createdAt.slice(0, 10))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </Section>
      </div>
    </div>
  )
}
