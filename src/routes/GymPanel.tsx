import { useEffect, useMemo, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import {
  ArrowsClockwise,
  Check,
  DownloadSimple,
  PaperPlaneTilt,
  Plus,
  Printer,
  Trash,
  UsersThree,
} from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import {
  BANNER_DURATIONS,
  TEMPLATE_LABELS,
  makeOfferCode,
  sentBy,
  audienceWithin,
  splitAudience,
  type GymMessage,
  type TemplateKind,
} from '../lib/messages'
import { listProfiles } from '../lib/profiles'
import { publishToServer, readSyncLink } from '../lib/sync'
import {
  AudienceStrip,
  CommercialConfirm,
  type BroadcastScope,
} from '@/components/broadcast-audience'
import { GymJoinCode, GymRequests } from '@/components/gym-operator-tools'
import { formatShortDate, pluralize } from '../lib/labels'
import { todayIso } from '../lib/dates'
import { generatedExercises } from '../data/exercises-generated'
import { Combobox } from '../ui/Combobox'
import { renderChallengeCard, shareOrDownloadPng } from '../lib/session-card'
import { validCollectionIds } from '../lib/collection'
import { exerciseById } from '../lib/exercises'
import { ExercisePicker } from '@/components/exercise-picker'
import { ExerciseThumb } from '../ui/ExerciseThumb'
import { MessageCard } from '@/components/message-card'
import { ImagePicker } from '@/components/image-picker'
import { RichTextEditor } from '@/components/rich-text-editor'
import { htmlToPlain, isEmptyHtml } from '@/lib/rich-text'
import type { PendingImage } from '@/lib/message-images'
import { MenuEditor } from '@/components/menu-editor'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabPanel } from '../ui/Tabs'
import { Collapse } from '../ui/Collapse'
import { useMenus } from '../store/useMenus'
import { menuFor, countItems } from '../lib/menu'
import { Avatar } from '../ui/Avatar'
import { Button, IconButton } from '../ui/Button'
import { FormSelect } from '../ui/FormSelect'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'
import { PageHeader } from '../ui/PageHeader'
import { Tag } from '../ui/Tag'
import { Stat } from '../ui/Stat'
import {
  REACH_WINDOWS,
  REACH_WINDOW_DAYS,
  reachCsv,
  summariseReach,
  windowDays,
  windowLabel,
  windowStart,
  type ReachWindowKey,
} from '../lib/gym-reach'
import { planAllows, planOf, type GymPlan } from '../lib/gym-plan'
import { guestList } from '../lib/gym-responses'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface CourseDraft {
  name: string
  dishes: string
}

/* Ordered by how much they earn the gym, not alphabetically: the two that
   move money sit where the thumb lands first. */
const KINDS: TemplateKind[] = [
  'offer',
  'product',
  'event',
  'menu',
  'challenge',
  'collection',
  'announcement',
]

/** Movement names for the challenge form's suggestion list, resolved on publish. */
const EXERCISE_NAMES = generatedExercises.map((e) => e.name).sort((a, b) => a.localeCompare(b))

function exerciseIdByName(name: string): string | null {
  const key = name.trim().toLowerCase()
  const match = generatedExercises.find((e) => e.name.toLowerCase() === key)
  return match?.id ?? null
}

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

/**
 * Who is actually coming. "going 12" tells a gym how many chairs to put out
 * and nothing about who to expect at the door; the names are the difference
 * between a metric and a door list, and they only exist because the answers
 * now travel rather than sitting on each member's phone.
 */
/**
 * What to write, per template. A placeholder that says "Optional details" gets
 * an empty field; one that shows the shape of a good answer gets a paragraph.
 * Each of these is the kind of thing a gym actually needs to say to sell the
 * thing above it.
 */
const BODY_PLACEHOLDER: Record<TemplateKind, string> = {
  offer:
    'Who it is for and what it saves them. Where to redeem it, and anything it does not cover.',
  product:
    'What it is made of, which sizes are on the shelf, and whether it can be tried before buying.',
  event:
    'What happens in the session, what to bring, and how much of it is hands-on.\n\nWho it suits — first timers, people coming back from a break, anyone chasing a number.',
  menu: 'What the kitchen is cooking today and until when.\n\nAnything worth flagging: what is high protein, what is vegetarian, what tends to run out.',
  challenge:
    'Why this movement, how to scale it on a bad day, and what a good month looks like.',
  collection:
    'What these movements have in common and when to reach for them.',
  announcement:
    'The change, when it starts, and what members should do differently.',
}

function GuestList({ message }: { message: GymMessage }) {
  const names = guestList(message)
  const going = Object.values(message.rsvp).filter((r) => r === 'yes').length
  if (going === 0) {
    return <p className="text-2xs text-ink-3">Nobody has answered yet.</p>
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-3">
      <span className="text-2xs font-medium tracking-wide text-ink-3 uppercase">
        {pluralize(going, 'place')} taken
      </span>
      {names.length > 0 ? (
        <p className="text-sm leading-relaxed text-ink-2">{names.join(' · ')}</p>
      ) : (
        /* Answered before this device last synced, or by a profile with no
           account: the count is real, the names simply are not here. */
        <p className="text-2xs text-ink-3">Names arrive with the next sync.</p>
      )}
    </div>
  )
}

/**
 * Publishing as the platform rather than as a gym.
 *
 * The house reuses this desk instead of getting a second composer of its own.
 * A parallel one would drift — a new template, a fixed validation, an added
 * field would land on one and not the other — and the surface that must never
 * mis-address anybody is the worst possible place for a stale copy.
 */
export interface BroadcastControls {
  scope: BroadcastScope
  setScope: (scope: BroadcastScope) => void
  onBack: () => void
}

export function GymDesk({
  gym,
  profileId,
  broadcast,
}: {
  gym: string
  profileId: string
  broadcast?: BroadcastControls
}) {
  const messages = useMessages((s) => s.messages)
  const publish = useMessages((s) => s.publish)
  const remove = useMessages((s) => s.remove)
  const menus = useMenus((s) => s.menus)
  const savedMenu = menuFor(menus, gym)
  const [tab, setTab] = useState('compose')

  /**
   * Who this desk can address. A gym's own members, or — for the house — the
   * people no gym has claimed, or everybody.
   *
   * Derived from the same directory the confirmation counts, so the number in
   * the warning and the list you can pick from can never disagree.
   */
  const scope = broadcast?.scope
  const { members, split } = useMemo(() => {
    /* One read of the directory for both. The list you can pick from and the
       number the warning quotes come from the same array, so they cannot
       disagree about who is out there. */
    const directory = listProfiles()
    return {
      members: audienceWithin(directory, gym, scope, profileId),
      split: splitAudience(directory, profileId),
    }
  }, [profileId, gym, scope])
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
  const [productName, setProductName] = useState('')
  const [productPrice, setProductPrice] = useState('')
  const [productNote, setProductNote] = useState('')
  const [chExerciseName, setChExerciseName] = useState('')
  const [chDays, setChDays] = useState('30')
  const [chStart, setChStart] = useState('20')
  const [chDelta, setChDelta] = useState('1')
  const [chUnit, setChUnit] = useState<'reps' | 'seconds'>('reps')
  const [collectionPicks, setCollectionPicks] = useState<string[]>([])
  const [collectionSearch, setCollectionSearch] = useState('')
  const [everyone, setEveryone] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [bannerOn, setBannerOn] = useState(false)
  const [bannerMinutes, setBannerMinutes] = useState('5')
  const [error, setError] = useState<string | null>(null)
  const [published, setPublished] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  /* Set when a commercial template is aimed at everyone; cleared by any of the
     three ways out. Holding it here rather than in a modal means the draft is
     still on screen behind the decision. */
  const [confirmWide, setConfirmWide] = useState(false)
  const [images, setImages] = useState<PendingImage[]>([])
  /**
   * Which plan this gym is on, read from its own row rather than cached on the
   * profile. A plan can change between one visit and the next — somebody
   * upgrades, somebody stops paying — and a stale copy would either refuse a
   * feature that is now paid for or hand over one that is not.
   */
  const [plan, setPlan] = useState<GymPlan>('base')
  const [reachWindow, setReachWindow] = useState<ReachWindowKey>('d30')

  /* Files need somewhere to live that is not this browser's storage quota, so
     the picker is only offered to an operator whose account can reach one. */
  const canUpload = !!readSyncLink(profileId)?.token

  useEffect(() => {
    const link = readSyncLink(profileId)
    if (!link?.token || broadcast) return
    const filter = encodeURIComponent(`name = "${gym.replace(/"/g, '')}"`)
    void fetch(`${link.server}/api/collections/gyms/records?perPage=1&filter=${filter}`, {
      headers: { authorization: link.token },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { items: { plan?: string }[] }) => setPlan(planOf(data.items[0]?.plan)))
      /* A server that will not say stays on the cheaper answer: refusing a paid
         feature is a complaint, handing over an unpaid one is a habit. */
      .catch(() => setPlan('base'))
  }, [profileId, gym, broadcast])

  const canPickWindow = planAllows(plan, 'reach-window')
  /* The kitchen is what Plus buys today. It was on for every gym, including the
     ones the page charges the lower price, which made the pricing page wrong in
     the expensive direction from the moment somebody paid it. */
  const canKitchen = planAllows(plan, 'kitchen')
  const windowedDays = windowDays(reachWindow)
  const since = windowedDays === null ? null : windowStart(todayIso(), windowedDays)

  const exportReach = () => {
    const csv = reachCsv(messages, gym, since)
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${gym.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}-reach-${todayIso()}.csv`
    a.click()
    /* Revoked on the next tick rather than immediately: Safari has not started
       reading the blob when `click()` returns. */
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

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
      body: isEmptyHtml(body) ? undefined : body,
      audience: 'all' as const,
      /* Local blob URLs stand in for the server's until it has them. */
      images: images.map((i) => ({ url: i.preview, alt: i.alt.trim() || undefined })),
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
    if (kind === 'product') {
      /* A price with no number in it is not a price. */
      if (!productName.trim() || !/\d/.test(productPrice)) return null
      return {
        ...common,
        product: {
          name: productName.trim(),
          price: productPrice.trim(),
          note: productNote.trim() || undefined,
        },
      }
    }
    if (kind === 'challenge') {
      const exerciseId = exerciseIdByName(chExerciseName)
      const days = Number(chDays)
      const start = Number(chStart)
      const delta = Number(chDelta)
      if (!exerciseId || !Number.isInteger(days) || days < 7 || days > 120) return null
      if (!Number.isFinite(start) || start <= 0 || !Number.isFinite(delta)) return null
      return {
        ...common,
        challenge: {
          id: 'preview',
          name: common.title,
          exerciseId,
          days,
          start,
          delta,
          unit: chUnit,
        },
      }
    }
    if (kind === 'collection') {
      const exerciseIds = validCollectionIds(collectionPicks, (id) => !!exerciseById(id))
      if (exerciseIds.length < 2) return null
      return {
        ...common,
        collection: {
          id: 'preview',
          name: common.title,
          blurb: common.body,
          exerciseIds,
          source: 'gym' as const,
        },
      }
    }
    return common
  }, [gym, profileId, kind, title, body, images, eventDate, eventTime, eventPlace, courses, discount, validUntil, code, productName, productPrice, productNote, chExerciseName, chDays, chStart, chDelta, chUnit, collectionPicks])

  /** The templates that sell something. The only ones the warning is about. */
  const COMMERCIAL: TemplateKind[] = ['offer', 'product']

  const doPublish = (opts?: { asScope?: BroadcastScope; force?: boolean }) => {
    const sendScope = opts?.asScope ?? broadcast?.scope
    if (
      sendScope === 'everyone' &&
      COMMERCIAL.includes(kind) &&
      !opts?.force &&
      split.affiliated > 0
    ) {
      setConfirmWide(true)
      setError(null)
      return
    }
    setConfirmWide(false)
    if (!draft) {
      setError(
        kind === 'event'
          ? 'An event needs a title and a date.'
          : kind === 'menu'
            ? 'A menu needs a title and at least one course with dishes.'
            : kind === 'offer'
              ? 'An offer needs a title and the discount.'
              : kind === 'product'
                ? 'A shop item needs a title, a name and a price with a number in it.'
              : kind === 'challenge'
                ? 'A challenge needs a title, a movement from the library, and sane numbers (7-120 days, positive start).'
                : kind === 'collection'
                  ? 'A collection needs a title and at least two movements.'
                  : 'Give the message a title.',
      )
      return
    }
    /**
     * The audience for the scope being sent, not the one the memo was built
     * for. When the confirmation narrows an offer, this call and the publish
     * happen in the same tick — the memo is still holding the wider list, and
     * reading the count from it reported ten deliveries for five.
     */
    const sendTo = audienceWithin(listProfiles(), gym, sendScope, profileId)
    /* Somebody picked under the wider scope may not be in the narrower one.
       They would never have received it — `isAddressedTo` checks the scope
       first — but leaving their id on the message inflates every count that
       looks at it afterwards. */
    const sendPicked = picked.filter((id) => sendTo.some((p) => p.id === id))
    if (!everyone && sendPicked.length === 0) {
      setError(
        broadcast
          ? 'Pick at least one person, or send to all of them.'
          : 'Pick at least one member, or send to everyone.',
      )
      return
    }
    const input = {
      gym,
      authorId: profileId,
      ...(sendScope ? { scope: sendScope } : {}),
      kind,
      title: draft.title,
      body: draft.body,
      audience: (everyone ? 'all' : sendPicked) as 'all' | string[],
      event: draft.event,
      menu: draft.menu,
      offer: draft.offer,
      product: draft.product,
      challenge: draft.challenge
        ? { ...draft.challenge, id: `chal-${gym.trim().toLowerCase()}-${Date.now()}` }
        : undefined,
      collection: draft.collection
        ? { ...draft.collection, id: `coll-${gym.trim().toLowerCase()}-${Date.now()}` }
        : undefined,
      banner: bannerOn ? { minutes: Number(bannerMinutes) } : undefined,
    }
    /* Server bus first when this operator account can reach it: the same id
       on both sides keeps the later pull from duplicating the sent copy, and
       it is the upload that turns the picker's blobs into real URLs. */
    const files = images.map((i) => ({ file: i.file, alt: i.alt }))
    void publishToServer(profileId, input, files).then((sent) => {
      publish(sent ? { ...input, id: sent.id, images: sent.images } : input)
      const reachCount = everyone ? sendTo.length : sendPicked.length
      const withPictures = images.length > 0 ? ` ${pluralize(images.length, 'picture')} attached.` : ''
      const who = broadcast
        ? sendScope === 'everyone'
          ? 'every member of enForma'
          : 'everyone with no gym'
        : gym
      setPublished(
        sent
          ? `Published to ${who} on every device.${withPictures} It is now under Sent.`
          : reachCount === 0
            ? broadcast
              ? 'Published. Nobody in this audience on this device yet — it sits under Sent and delivers as they arrive.'
              : 'Published. No members on this device yet — it sits under Sent and delivers as they join.'
            : `Published to ${pluralize(reachCount, broadcast ? 'person' : 'member', broadcast ? 'people' : 'members')} on this device. It is now under Sent.`,
      )
      for (const image of images) URL.revokeObjectURL(image.preview)
      setImages([])
    })
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
    setProductName('')
    setProductPrice('')
    setProductNote('')
    setChExerciseName('')
    setChDays('30')
    setChStart('20')
    setChDelta('1')
    setChUnit('reps')
    setCollectionPicks([])
    setCollectionSearch('')
    setEveryone(true)
    setPicked([])
    setBannerOn(false)
  }

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setError(null)
    setPublished(null)
  }

  return (
    <div className="flex flex-col gap-8">
      {broadcast ? (
        <PageHeader
          title="Broadcast"
          description="enForma writes to its own members the same way a gym writes to theirs. The only difference is who is listening, and that is a decision, not a setting."
        />
      ) : (
        <PageHeader
          title="Gym panel"
          description={`${gym} — reach your members with events, menus, offers and challenges.`}
        />
      )}

      {broadcast && (
        <AudienceStrip
          scope={broadcast.scope}
          split={split}
          onChange={() => {
            setConfirmWide(false)
            broadcast.onBack()
          }}
        />
      )}

      <Tabs
        value={tab}
        onValueChange={setTab}
        /* The house runs no kitchen and nobody applies to join it, so those two
           are absent rather than present and empty. An empty tab reads as a
           feature that is broken; a missing one reads as a feature that does
           not apply, which is the truth. */
        tabs={[
          { value: 'compose', label: 'Compose' },
          { value: 'sent', label: 'Sent', count: sent.length },
          ...(broadcast || !canKitchen
            ? []
            : [{ value: 'menu', label: 'Menu', count: savedMenu ? countItems(savedMenu) : 0 }]),
          {
            value: 'members',
            label: broadcast?.scope === 'everyone' ? 'Everyone' : 'Members',
            count: members.length,
          },
          ...(broadcast ? [] : [{ value: 'requests', label: 'Requests' }]),
        ]}
      >
        <TabPanel value="compose" className="flex flex-col gap-6">
          <Panel padding="lg" className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Template">
                {/* The house runs no kitchen, so the daily menu is not on offer
                    here — its Menu tab is absent for the same reason, and a
                    template you can fill in while the thing behind it does not
                    exist is worse than one that is simply not there. */}
                {KINDS.filter((k) => k !== 'menu' || (!broadcast && canKitchen)).map((k) => (
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

              {!broadcast && !canKitchen && (
                /* Named rather than silently absent. A gym that has heard about
                   the daily menu and cannot find it will ask us; one that reads
                   this either upgrades or stops looking. */
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
                  <Tag tone="outline">Plus</Tag>
                  The daily menu and your standing kitchen card come with Plus.
                </p>
              )}

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
                        : kind === 'challenge'
                          ? 'September squat countdown'
                          : kind === 'collection'
                            ? 'For desk workers'
                            : 'New opening hours'
                }
              />

              {/* Every template, the daily menu included: a kitchen card with
                  no sentence about it is a price list. The old field was three
                  rows labelled "Optional details", which is a caption, not a
                  place to explain what you are selling. */}
              <div className="flex flex-col gap-1.5">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <label htmlFor="gym-body" className="text-2xs font-medium text-ink-3">
                    Message body
                  </label>
                  {!isEmptyHtml(body) && (
                    <span className="num text-2xs text-ink-3">
                      {htmlToPlain(body).length} characters
                    </span>
                  )}
                </span>
                <RichTextEditor
                  id="gym-body"
                  value={body}
                  onChange={touch(setBody)}
                  placeholder={BODY_PLACEHOLDER[kind]}
                />
                <span className="text-2xs text-ink-3">
                  Headings, lists, emphasis and links. Say what it is, who it is for, and what
                  to do next.
                </span>
              </div>

              <ImagePicker
                images={images}
                onChange={setImages}
                disabled={!canUpload}
                disabledReason="Pictures travel with your sync account. Sign in under Settings → Data to attach them."
              />

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

              {kind === 'challenge' && (
                <div className="flex flex-col gap-3">
                  <Combobox
                    label="Movement"
                    value={chExerciseName}
                    onValueChange={touch(setChExerciseName)}
                    options={EXERCISE_NAMES}
                    placeholder="Bodyweight Squat"
                    createLabel="Use"
                  />
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Input
                      label="Days"
                      type="number"
                      min={7}
                      max={120}
                      value={chDays}
                      onChange={(e) => touch(setChDays)(e.target.value)}
                    />
                    <Input
                      label="Day 1 count"
                      type="number"
                      min={1}
                      value={chStart}
                      onChange={(e) => touch(setChStart)(e.target.value)}
                    />
                    <Input
                      label="Change per day"
                      type="number"
                      value={chDelta}
                      onChange={(e) => touch(setChDelta)(e.target.value)}
                    />
                    <div className="flex flex-col gap-1.5">
                      <span className="text-2xs font-medium text-ink-3">Unit</span>
                      <FormSelect
                        ariaLabel="Challenge unit"
                        value={chUnit}
                        onValueChange={(v) => touch(setChUnit)(v as 'reps' | 'seconds')}
                        options={[
                          { value: 'reps', label: 'Reps' },
                          { value: 'seconds', label: 'Seconds' },
                        ]}
                        className="h-11"
                      />
                    </div>
                  </div>
                  <p className="text-2xs text-ink-3">
                    Use a negative change for a countdown — hard days first, momentum later.
                  </p>
                </div>
              )}

              {kind === 'collection' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setCollectionSearch('open')}
                    >
                      <Plus size={14} weight="bold" />
                      Add movement
                    </Button>
                    <span className="text-2xs text-ink-3">
                      {collectionPicks.length === 0
                        ? 'Pick at least two.'
                        : pluralize(collectionPicks.length, 'movement')}
                    </span>
                  </div>
                  {collectionPicks.length > 0 && (
                    <ul className="flex flex-col gap-1.5">
                      {collectionPicks.map((id) => {
                        const ex = exerciseById(id)
                        return (
                          <li
                            key={id}
                            className="flex items-center gap-3 rounded-md bg-surface-2 px-3 py-2"
                          >
                            {ex && <ExerciseThumb exercise={ex} size="sm" />}
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {ex?.name ?? id}
                            </span>
                            <IconButton
                              aria-label={`Remove ${ex?.name ?? id}`}
                              onClick={() =>
                                touch(setCollectionPicks)(collectionPicks.filter((p) => p !== id))
                              }
                            >
                              <Trash size={14} />
                            </IconButton>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                  <ExercisePicker
                    open={collectionSearch === 'open'}
                    onOpenChange={(open) => setCollectionSearch(open ? 'open' : '')}
                    excludeIds={collectionPicks}
                    title="Add to this collection"
                    description="Movements members will see grouped under this hub."
                    onSelect={(exercise) => {
                      touch(setCollectionPicks)([...collectionPicks, exercise.id])
                      setCollectionSearch('')
                    }}
                  />
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

              {kind === 'product' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label="Item"
                    value={productName}
                    onChange={(e) => touch(setProductName)(e.target.value)}
                    placeholder="Hangar training tee"
                  />
                  {/* Free text, and no decimal keypad: the currency is part
                      of what you type, because the app has no idea which one
                      this gym charges in. */}
                  <Input
                    label="Price"
                    value={productPrice}
                    onChange={(e) => touch(setProductPrice)(e.target.value)}
                    placeholder="649 kr"
                    hint="However your members read it, currency included."
                  />
                  {/* Input hands className to the field itself, so the column
                      span has to live on a wrapper. */}
                  <div className="sm:col-span-2">
                    <Input
                      label="What it is"
                      value={productNote}
                      onChange={(e) => touch(setProductNote)(e.target.value)}
                      hint="Optional. Members reserve one here and pay at the desk."
                    />
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
                    {/* "Everyone" here means everyone in the chosen audience,
                        which is a different everyone from the scope's. Two
                        controls one above the other using the same word for
                        different sets is how somebody ends up sure they
                        narrowed something they did not. */}
                    {broadcast ? 'All of them' : 'Everyone'} ({members.length})
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

              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  <Switch
                    aria-label="Show as a banner"
                    checked={bannerOn}
                    onCheckedChange={(on) => {
                      setBannerOn(on)
                      setPublished(null)
                    }}
                  />
                  Show as a banner
                </label>
                {bannerOn && (
                  <FormSelect
                    ariaLabel="Banner duration"
                    size="sm"
                    value={bannerMinutes}
                    onValueChange={setBannerMinutes}
                    options={BANNER_DURATIONS.map((d) => ({
                      value: String(d.minutes),
                      label: `for ${d.label.toLowerCase()}`,
                    }))}
                    className="w-40"
                  />
                )}
              </div>

                      {confirmWide && broadcast ? (
                <CommercialConfirm
                  split={split}
                  kindLabel={TEMPLATE_LABELS[kind]}
                  onNarrow={() => {
                    broadcast.setScope('unaffiliated')
                    doPublish({ asScope: 'unaffiliated' })
                  }}
                  onSendAnyway={() => doPublish({ force: true })}
                  onCancel={() => setConfirmWide(false)}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="primary" onClick={() => doPublish()}>
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
              )}
          </Panel>

          {draft && (
            <div className="flex flex-col gap-2">
              <span className="text-2xs font-medium text-ink-3">Preview — what members see</span>
              <MessageCard message={draft} />
            </div>
          )}
        </TabPanel>

        <TabPanel value="sent">
          {/* What the publishing actually bought. The per-message tallies below
              were always here; nobody had ever added them up, which left the
              paying side of this product with no way to see its own return. */}
          {sent.length > 0 && (
            <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
              {(() => {
                const reach = summariseReach(messages, gym, since)
                const hint = windowLabel(reachWindow)
                return (
                  [
                    { label: 'Published', value: reach.published },
                    { label: 'Members reached', value: reach.membersReached },
                    { label: 'Going to events', value: reach.going },
                    { label: 'Offers saved', value: reach.offersSaved },
                    { label: 'Items reserved', value: reach.itemsReserved },
                    { label: 'Challenges joined', value: reach.challengesJoined },
                  ] as const
                ).map((item) => (
                  <Panel key={item.label} padding="md">
                    <Stat label={item.label} value={item.value} hint={hint} />
                  </Panel>
                ))
              })()}
            </div>
          )}

          {sent.length > 0 && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              {canPickWindow ? (
                <>
                  <FormSelect
                    ariaLabel="Reach window"
                    size="sm"
                    value={reachWindow}
                    onValueChange={(v) =>
                      /* Read back off the same list that rendered the options,
                         so a value the type does not know about cannot arrive
                         through a cast. */
                      setReachWindow(REACH_WINDOWS.find((w) => w.key === v)?.key ?? 'd30')
                    }
                    options={REACH_WINDOWS.map((w) => ({ value: w.key, label: w.label }))}
                    className="w-44"
                  />
                  <Button variant="secondary" size="sm" onClick={exportReach}>
                    <DownloadSimple size={15} />
                    Export as CSV
                  </Button>
                </>
              ) : (
                /* Named, not hidden. A gym on Base should know the longer view
                   exists and what it costs, rather than wondering why the
                   figures only ever cover a month. */
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
                  <Tag tone="outline">Plus</Tag>
                  Any window and a CSV export come with Plus. These figures cover the last{' '}
                  {REACH_WINDOW_DAYS} days.
                </p>
              )}
            </div>
          )}

          {sent.length === 0 ? (
            <Panel padding="lg">
              <p className="text-sm text-ink-3">
                Nothing published yet. Compose a message and its history lands here, with read,
                RSVP and save tallies.
              </p>
            </Panel>
          ) : (
            <div className="flex flex-col gap-2">
              {sent.map((m) => {
                const going = Object.values(m.rsvp).filter((r) => r === 'yes').length
                const declined = Object.values(m.rsvp).filter((r) => r === 'no').length
                return (
                  <Panel key={m.id} padding="md">
                    <Collapse
                      header={
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <Tag>{TEMPLATE_LABELS[m.kind]}</Tag>
                            <span className="truncate text-sm font-semibold text-ink">
                              {m.title}
                            </span>
                          </span>
                          <span className="num text-2xs font-normal text-ink-3">
                            {formatShortDate(m.createdAt.slice(0, 10))} ·{' '}
                            {m.audience === 'all'
                              ? 'everyone'
                              : pluralize(m.audience.length, 'member')}{' '}
                            · read {m.readBy.length}
                            {m.kind === 'event' ? ` · going ${going} · declined ${declined}` : ''}
                            {m.kind === 'offer' ? ` · saved ${m.saved.length}` : ''}
                            {m.kind === 'product' ? ` · reserved ${m.saved.length}` : ''}
                            {m.kind === 'product' && m.product
                              ? ` · ${m.product.price}`
                              : ''}
                            {m.kind === 'offer' && m.offer ? ` · code ${m.offer.code}` : ''}
                            {m.kind === 'challenge' ? ` · joined ${m.joined?.length ?? 0}` : ''}
                            {m.kind === 'collection' && m.collection
                              ? ` · ${pluralize(m.collection.exerciseIds.length, 'movement')}`
                              : ''}
                          </span>
                        </span>
                      }
                      headerExtras={
                        <>
                        {(m.kind === 'challenge' || m.kind === 'collection') && (
                          <IconButton
                            aria-label={`Print ${m.title} for the wall`}
                            onClick={() => window.print()}
                          >
                            <Printer size={15} />
                          </IconButton>
                        )}
                        {m.kind === 'challenge' && m.challenge && (
                          <IconButton
                            aria-label={`Download ${m.title} as a wall poster`}
                            onClick={() =>
                              void renderChallengeCard(m.challenge!, gym).then((blob) =>
                                shareOrDownloadPng(blob, `enforma-challenge-${m.challenge!.id}.png`),
                              )
                            }
                          >
                            <DownloadSimple size={15} />
                          </IconButton>
                        )}
                        {confirmDelete === m.id ? (
                          <>
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
                          </>
                        ) : (
                          <IconButton
                            aria-label={`Delete ${m.title}`}
                            onClick={() => setConfirmDelete(m.id)}
                          >
                            <Trash size={15} />
                          </IconButton>
                        )}
                        </>
                      }
                    >
                      <div className="flex flex-col gap-3">
                        <MessageCard message={m} />
                        {m.kind === 'event' && <GuestList message={m} />}
                      </div>
                    </Collapse>
                  </Panel>
                )
              })}
            </div>
          )}
        </TabPanel>

        <TabPanel value="menu">
          <MenuEditor gym={gym} profileId={profileId} />
        </TabPanel>

        <TabPanel value="members" className="flex flex-col gap-4">
          <GymJoinCode />
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
        </TabPanel>

        <TabPanel value="requests">
          <GymRequests />
        </TabPanel>
      </Tabs>
    </div>
  )
}
