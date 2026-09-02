import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Barbell,
  Buildings,
  CalendarBlank,
  ChartLineUp,
  Check,
  Clock,
  ForkKnife,
  type Icon,
  LockKey,
  Megaphone,
  PaperPlaneTilt,
  Receipt,
  SealCheck,
  Sparkle,
  Stack,
  Storefront,
  UsersThree,
  Trophy,
  Users,
} from '@phosphor-icons/react'
import { CATALOGUE_SIZE } from '@/data/catalogue-stats'
import { WGER_SIZE } from '@/data/wger-stats'
import { REACH_WINDOW_DAYS } from '@/lib/gym-reach'
import { TEMPLATE_LABELS } from '@/lib/messages'
import {
  ENTERPRISE_GYMS,
  ENTERPRISE_MATCHES_BASE,
  ENTERPRISE_SAVING,
  isBuilt,
  PRICES,
  type PlusFeature,
} from '@/lib/gym-plan'
import { activeAuthHeader, activeServer, readSyncLink } from '@/lib/sync'
import { activeProfile } from '@/lib/profiles'
import { AuthPanel } from '@/components/auth-panel'
import { GymHeroProof } from '@/components/gym-hero-proof'
import { RailToggle } from '@/components/rail-toggle'
import { useRailHidden } from '@/hooks/use-rail'
import {
  AuroraWash,
  Body,
  Label,
  LandingRail,
  Lead,
  MobileBar,
  READ,
  Reveal,
  SHELL,
  SectionHeading,
  type LandingSection,
} from '@/components/landing-kit'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { FormSelect } from '@/ui/FormSelect'
import { Panel } from '@/ui/Panel'
import { Tag } from '@/ui/Tag'
import { cn } from '@/lib/utils'

/**
 * The other front door.
 *
 * The member landing sells a free thing to somebody who wants to train. This
 * one sells a paid thing to the business that wants to reach them, and the two
 * arguments are not the same argument turned around — the gym is buying access
 * to attention that somebody else's product earned. So the page says that
 * plainly and spends its first section on why a member keeps the app at all.
 * A reach number is worth nothing if the app is deleted in a fortnight.
 *
 * What it must never do is imply the gym can see training. It cannot: the
 * training is encrypted with a key that never leaves the member's device, so
 * the server holds rows it cannot read and there is nothing to sell, to us or
 * to anybody. That is the strongest line on the page and it is also a hard
 * boundary on every feature that can ever be priced here.
 */

const SECTIONS: LandingSection[] = [
  { id: 'top', label: 'Overview', icon: Buildings },
  { id: 'why', label: 'Why they stay', icon: Barbell },
  { id: 'say', label: 'What you can say', icon: Megaphone },
  { id: 'learn', label: 'What you learn', icon: ChartLineUp },
  { id: 'plans', label: 'Plans', icon: Receipt },
  { id: 'apply', label: 'Apply', icon: SealCheck },
]

const LIBRARY_SIZE = (CATALOGUE_SIZE + WGER_SIZE).toLocaleString('en')

/**
 * Counted, never typed — and the first version of this line said exactly that
 * above a hardcoded 7, which is the same lie with a comment on it. Both figures
 * come off the map the composer actually renders, so adding a template updates
 * the page and adding one the page ignores is impossible.
 */
const TEMPLATE_COUNT = Object.keys(TEMPLATE_LABELS).length
/** Everything except the kitchen, which is what Plus adds. */
const BASE_TEMPLATE_COUNT = TEMPLATE_COUNT - 1

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const spell = (n: number) => WORDS[n] ?? String(n)

/* Grouped, like every other figure on this page: "€1000" beside "2,076" reads
   as a typo rather than as a price. */
const money = (n: number) => n.toLocaleString('en-GB')

/** Why the attention exists before anybody sells access to it. */
const WHY: { icon: Icon; title: string; body: string }[] = [
  {
    icon: Barbell,
    title: 'The programme is why they open it',
    body: 'enForma reads a member’s goal, level and the hours they actually have, then builds a periodised programme with a deload every fourth week. It says how long the goal really takes, out loud, and shows the arithmetic.',
  },
  {
    icon: Stack,
    title: 'And it costs them nothing',
    body: `${LIBRARY_SIZE} freely licensed movements, the planner, the session timer and the history. No account is needed to train, so nobody is deciding whether your gym is worth a sign-up.`,
  },
  {
    icon: LockKey,
    title: 'Nothing they train leaves the device',
    body: 'It is encrypted with a key derived from their passphrase. The server keeps rows it cannot open. That is why they trust it, and it is the reason a message from you gets opened rather than swiped away.',
  },
]

interface Feature {
  icon: Icon
  title: string
  body: string
  /**
   * A Plus feature, which is how the page knows whether to mark it `Coming`.
   * Read from `isBuilt` rather than written here: a hand-maintained flag would
   * eventually advertise something the panel's gate still refuses, and that is
   * a page charging for a feature that does not answer.
   */
  id?: PlusFeature
}

const SAY: Feature[] = [
  { icon: Megaphone, title: 'Announcement', body: 'The change, when it starts, and what to do differently. Formatted, with pictures.' },
  { icon: CalendarBlank, title: 'Event', body: 'Date, time and room. Members answer, and you get a guest list by name rather than a headcount.' },
  { icon: Receipt, title: 'Offer', body: 'A discount with a QR code and a redemption code they can save. You see how many put it aside.' },
  { icon: Storefront, title: 'In the shop', body: 'Something you sell over the counter. They reserve one and pick it up. No basket, no payment, no fee.' },
  { icon: Trophy, title: 'Challenge', body: 'A movement, a ramp and a month. Whoever joins gets it in their own planner, counted for them.' },
  { icon: Stack, title: 'Collection', body: 'A hub of movements you picked, in their library, under your name.' },
  { icon: ForkKnife, title: 'Daily menu', body: 'What the kitchen is cooking, on the screen they open first every morning.' },
]

const BASE: Feature[] = [
  {
    icon: Megaphone,
    title: `${spell(BASE_TEMPLATE_COUNT).replace(/^./, (c) => c.toUpperCase())} of the ${spell(TEMPLATE_COUNT)} templates`,
    body: 'Announcements, events, offers, the shop, challenges and collections. Everything except the kitchen.',
  },
  { icon: Sparkle, title: 'Banners over their app', body: 'Five minutes to all day, dismissible, for the thing that cannot wait for them to open the inbox.' },
  { icon: Users, title: 'Send to everyone, or to names', body: 'Four pictures a message. Guest lists by name for events.' },
  { icon: SealCheck, title: 'Your roster, your door', body: 'A join code for the desk, or approve requests one by one. Members leave whenever they like.' },
  { icon: ChartLineUp, title: `Reach, last ${REACH_WINDOW_DAYS} days`, body: 'Published, members reached, going, offers saved, items reserved, challenges joined. Counted from what people did.' },
  { icon: PaperPlaneTilt, title: 'Delivered with the app closed', body: 'Web push to every device a member has signed in on.' },
]

const PLUS: Feature[] = [
  { id: 'kitchen', icon: ForkKnife, title: 'The kitchen', body: 'The daily menu and your standing kitchen card, on Today and on its own page. The one surface here that leads where money changes hands.' },
  { id: 'programmes', icon: Barbell, title: 'Programmes signed by your gym', body: 'Publish a programme your members adopt in one tap, with your name on it, instead of the one the app would have built. Each one gets their own dated copy, and what they do with it stays on their phone.' },
  { id: 'open-door', icon: Storefront, title: 'Reach people with no gym', body: 'The one thing here that wins you somebody you have not already got: an offer to everyone on enForma who has not joined a gym. One a month. You are never told who they are, and there is no location filter. We hold no location for anybody, and we would rather say so than imply a segmentation that does not exist.' },
  { id: 'scheduling', icon: Clock, title: 'Write it now, publish it later', body: 'Monday’s menu on Sunday evening. A week of posts in one sitting. Nobody can read one before its time. The server will not hand it over, not even to somebody asking for it directly.' },
  { id: 'reach-window', icon: ChartLineUp, title: 'Reach with no window, exported', body: `Past the ${REACH_WINDOW_DAYS} days, and out as a file you can put next to your own numbers.` },
  { id: 'operators', icon: UsersThree, title: 'Staff who can publish', body: 'Invite the people who actually work the desk, so posting is not one person’s phone. Every message says who sent it, and the roster is the owner’s to change.' },
  { id: 'second-rooms', icon: Buildings, title: 'More than one room', body: 'Two locations under one account, each with its own roster and its own inbox.' },
  { id: 'branding', icon: Sparkle, title: 'Your colour on your own surfaces', body: 'Your banner, your card on their Today screen and your name above a message, in your colour. Not the whole app: the shell stays ours, because it is where a member reads that their training is theirs and unreadable, and a shell wearing your name would quietly tell them otherwise.' },
]

const BUILT_PLUS = PLUS.filter((f) => f.id && isBuilt(f.id))
const COMING_PLUS = PLUS.filter((f) => f.id && !isBuilt(f.id))

/**
 * "the kitchen", "the kitchen and the reach window", "a, b and c".
 *
 * Lower-cased from the feature titles rather than written a second time, so the
 * sentence and the list above it cannot describe different things.
 */
function readable(features: Feature[]): string {
  const names = features.map((f) => f.title.replace(/^The /, 'the ').replace(/^([A-Z])/, (c) => c.toLowerCase()))
  if (names.length === 0) return 'nothing yet'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const SIZES = ['Under 100', '100 to 300', '300 to 800', 'More than 800'] as const

function FeatureRow({ feature }: { feature: Feature }) {
  const coming = feature.id !== undefined && !isBuilt(feature.id)
  return (
    <li className="flex items-start gap-3.5 py-3.5">
      <feature.icon
        size={18}
        weight="regular"
        className={cn('mt-0.5 shrink-0', coming ? 'text-ink-3' : 'text-accent-gym')}
      />
      <span className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink">{feature.title}</span>
          {coming && <Tag tone="outline">Coming</Tag>}
        </span>
        <span className="max-w-[46ch] text-2xs leading-relaxed text-ink-3">{feature.body}</span>
      </span>
    </li>
  )
}

export function GymLanding({ onUnlocked }: { onUnlocked?: () => void } = {}) {
  const railHidden = useRailHidden()
  const [active, setActive] = useState('top')

  const jump = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  /* Which section the rail should light. One observer for the page rather than
     a scroll listener, which would run on every frame for a decoration. */
  useEffect(() => {
    const seen = new Map<string, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target.id, entry.intersectionRatio)
        let best = 'top'
        let ratio = 0
        for (const [id, value] of seen) {
          if (value > ratio) {
            ratio = value
            best = id
          }
        }
        setActive(best)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1], rootMargin: '-20% 0px -60% 0px' },
    )
    for (const section of SECTIONS) {
      const node = document.getElementById(section.id)
      if (node) observer.observe(node)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div className="min-h-[100dvh] bg-bg select-text">
      <LandingRail
        sections={SECTIONS}
        active={active}
        onJump={jump}
        cta={{ label: 'Apply', target: 'apply', icon: <ArrowRight size={16} weight="bold" /> }}
        note="Invoiced, not charged"
        crossLink={{ label: 'I want to train', short: 'For members', href: '/' }}
      />
      <RailToggle floating />
      <MobileBar
        onJump={jump}
        cta={{ label: 'Apply', target: 'apply' }}
        crossLink={{ label: 'I want to train', short: 'For members', href: '/' }}
      />

      <main className={railHidden ? undefined : 'lg:pl-60'}>
        {/* ------------------------------------------------------------- Hero */}
        <section id="top" className="relative overflow-hidden scroll-mt-4">
          {/* Orange leads here, as green leads the member landing — the same
              material, turned round. */}
          <AuroraWash tone="orange" className="-top-[26%] -right-[14%] size-[48vw] max-w-[820px]" />
          {/* Two columns at `xl`, not `lg`. With the 240px rail beside it, 1024px
              left the headline about 420px to work in and it broke into six
              lines — "Your / members / keep this / app. You get / to be the /
              gym in it." The measurement, not the taste: the split only earns
              its keep once there is room for both halves. */}
          <div className={cn(SHELL, 'relative grid gap-10 py-14 md:py-20 xl:grid-cols-[1.35fr_1fr] xl:gap-16')}>
            <div className="flex flex-col gap-6">
              <Label>For gyms</Label>
              <h1 className="max-w-[19ch] text-4xl leading-[1.05] tracking-tight text-ink md:text-5xl xl:text-6xl">
                Your members keep this app. You get to be the gym in it.
              </h1>
              <Lead>
                Each member gets a periodised programme, free, on their own device. What they train
                is encrypted, so they keep it.
              </Lead>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" onClick={() => jump('apply')} className="active:translate-y-px">
                  Apply for an account
                  <ArrowRight size={16} weight="bold" />
                </Button>
                <Button variant="ghost" onClick={() => jump('plans')}>
                  See the plans
                </Button>
              </div>
              <p className="max-w-[52ch] text-2xs leading-relaxed text-ink-3">
                &euro;{PRICES.base} or &euro;{PRICES.plus} a month per gym, &euro;
                {money(PRICES.enterprise)} for up to {ENTERPRISE_GYMS}. We invoice; nothing on this
                page charges
                you, and applying costs nothing.
              </p>
            </div>

            <Reveal className="flex xl:items-end">
              <GymHeroProof libraryFigure={LIBRARY_SIZE} />
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------- Why they stay */}
        <section id="why" className="scroll-mt-4 border-t border-line py-14 md:py-20">
          <div className={cn(READ, 'flex flex-col gap-10')}>
            <div className="flex flex-col gap-4">
              <SectionHeading>Reach is worth nothing if the app gets deleted.</SectionHeading>
              <Lead>
                So the first thing worth your money is not ours to charge for: the reason a member
                keeps enForma on their phone after the first week.
              </Lead>
            </div>
            {/* Zig-zag rather than a row of equal cards: each of these is a
                different length and pretending otherwise flattens all three. */}
            <ul className="flex flex-col divide-y divide-line">
              {WHY.map((item, i) => (
                <li key={item.title}>
                  <Reveal
                    delay={i * 0.05}
                    className={cn(
                      'grid gap-4 py-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-8',
                      i % 2 === 1 && 'md:pl-[12%]',
                    )}
                  >
                    {/* Green: this whole section is the member's half of the
                        relationship — why they keep the app at all. */}
                    <item.icon size={26} weight="regular" className="text-accent-member" />
                    <div className="flex flex-col gap-2.5">
                      <h3 className="max-w-[24ch] text-xl leading-snug text-ink">{item.title}</h3>
                      <Body className="max-w-[58ch]">{item.body}</Body>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ------------------------------------------------ What you can say */}
        <section id="say" className="scroll-mt-4 border-t border-line py-14 md:py-20">
          <div className={cn(READ, 'grid gap-10 lg:grid-cols-[1fr_1.5fr] lg:gap-16')}>
            <div className="flex flex-col gap-4 lg:sticky lg:top-10 lg:self-start">
              <SectionHeading>
                {spell(TEMPLATE_COUNT).replace(/^./, (c) => c.toUpperCase())} things you can put in
                their day.
              </SectionHeading>
              <Body>
                Each one is a real surface in the app, not a notification with a link. An event
                collects answers. An offer carries a code. A challenge lands in their planner and
                counts itself.
              </Body>
            </div>
            <ul className="flex flex-col divide-y divide-line">
              {SAY.map((item) => (
                <FeatureRow key={item.title} feature={item} />
              ))}
            </ul>
          </div>
        </section>

        {/* --------------------------------------------------- What you learn */}
        <section id="learn" className="scroll-mt-4 border-t border-line py-14 md:py-20">
          <div className={cn(READ, 'grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16')}>
            <div className="flex flex-col gap-5">
              <SectionHeading>What you learn, and what nobody learns.</SectionHeading>
              <Body className="max-w-[56ch]">
                Every figure in your panel is counted from something a member actually did:
                opened it, answered it, saved it, reserved it, joined it. None of it is modelled and
                none of it is a guess.
              </Body>
              <ul className="flex flex-col gap-2 pt-1">
                {['Published', 'Members reached', 'Going', 'Offers saved', 'Items reserved', 'Challenges joined'].map(
                  (metric) => (
                    <li key={metric} className="flex items-center gap-2.5 text-sm text-ink-2">
                      <Check size={14} weight="bold" className="shrink-0 text-accent-gym" />
                      {metric}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <Reveal className="flex">
              {/* The blunt one. Sold as a limit, because it is one, and because
                  a gym that has been offered somebody's training data before
                  knows what it is worth that we cannot. */}
              <Panel padding="lg" className="flex w-full flex-col gap-4">
                <LockKey size={22} weight="regular" className="text-ink-2" />
                <h3 className="max-w-[22ch] text-xl leading-snug text-ink">
                  We cannot sell you their training. Nobody can.
                </h3>
                <Body className="max-w-none">
                  Sets, weights, history and body measurements are encrypted with a key derived from
                  the member&rsquo;s own passphrase. It never leaves their device, so the server
                  holds rows it cannot open.
                </Body>
                <Body className="max-w-none">
                  You will never see what somebody lifted, and neither will we. That is not a
                  setting we could change for the right price. There is no copy of the key to
                  change it with.
                </Body>
              </Panel>
            </Reveal>
          </div>
        </section>

        {/* -------------------------------------------------------- The plans */}
        <section id="plans" className="scroll-mt-4 border-t border-line py-14 md:py-20">
          <div className={cn(READ, 'flex flex-col gap-10')}>
            <div className="flex flex-col gap-4">
              <SectionHeading>Two per gym, and one for a group of them.</SectionHeading>
              <Lead>
                The first buys everything your gym says. The second buys a place in the screen your
                members open before they have got their shoes on. The third is for whoever runs
                more than one room.
              </Lead>
            </div>

            {/* Unequal on purpose: Plus is the argument, Base is the floor. */}
            <div className="grid items-start gap-5 lg:grid-cols-[1fr_1.15fr] lg:gap-6">
              <Panel tone="quiet" padding="lg" className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink">Base</span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-4xl leading-none tracking-tight text-ink">
                      &euro;{PRICES.base}
                    </span>
                    <span className="text-xs text-ink-3">a month, per gym</span>
                  </span>
                  <Body className="max-w-[38ch] pt-1">
                    Everything your gym says, and the count of who listened.
                  </Body>
                </div>
                <ul className="flex flex-col divide-y divide-line border-t border-line">
                  {BASE.map((f) => (
                    <FeatureRow key={f.title} feature={f} />
                  ))}
                </ul>
              </Panel>

              <Panel padding="lg" className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">Plus</span>
                    <Tag tone="brand">Everything in Base</Tag>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-5xl leading-none tracking-tight text-ink">
                      &euro;{PRICES.plus}
                    </span>
                    <span className="text-xs text-ink-3">a month, per gym</span>
                  </span>
                  <Body className="max-w-[38ch] pt-1">
                    And a place in the day: the kitchen now, the programme next.
                  </Body>
                </div>
                <ul className="flex flex-col divide-y divide-line border-t border-line">
                  {PLUS.map((f) => (
                    <FeatureRow key={f.title} feature={f} />
                  ))}
                </ul>
                {/* The line a gym owner deserves before they are asked for
                    another hundred euros a month — and counted, so it cannot go
                    stale the way "the five marked Coming" did the moment a
                    sixth was built. */}
                <p className="max-w-[52ch] rounded-lg border border-dashed border-line px-3 py-2.5 text-2xs leading-relaxed text-ink-2">
                  Today, Plus buys you {readable(BUILT_PLUS)}.
                  {/* Singular and plural both, because the count is counted:
                      building the second-to-last of these left the sentence
                      reading "the one marked Coming are not built yet — they
                      are what Plus becomes", on a page that charges money. */}
                  {COMING_PLUS.length === 1 && (
                    <>
                      {' '}
                      The one marked <strong className="font-medium text-ink">Coming</strong> is not
                      built yet. It is what Plus becomes next, it carries no date, and it
                      does not change what you pay now.
                    </>
                  )}
                  {COMING_PLUS.length > 1 && (
                    <>
                      {' '}
                      The {spell(COMING_PLUS.length)} marked{' '}
                      <strong className="font-medium text-ink">Coming</strong> are not built yet
                      . They are what Plus becomes, they carry no date, and they do not change
                      what you pay now.
                    </>
                  )}
                </p>
              </Panel>
            </div>

            {/* Third, and deliberately below rather than beside: it is a
                different question — how many gyms — not a longer list of
                features, and putting it in the same row would invite reading it
                as "Plus, but more". */}
            <Panel tone="quiet" padding="lg" className="flex flex-col gap-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex flex-col gap-1.5">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink">Enterprise</span>
                    <Tag tone="brand">Everything in Plus, per gym</Tag>
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="num text-4xl leading-none tracking-tight text-ink">
                      &euro;{money(PRICES.enterprise)}
                    </span>
                    <span className="text-xs text-ink-3">a month, up to {ENTERPRISE_GYMS} gyms</span>
                  </span>
                  <Body className="max-w-[44ch] pt-1">
                    One account across all of them, each with its own roster, its own members and
                    its own inbox. A member belongs to the room they train in, not to the company.
                  </Body>
                </div>
                {/* Arithmetic rather than an adjective, and computed from the
                    two prices above it so it cannot drift from them. A saving a
                    reader can check is worth more than one they have to take on
                    trust — and this page is read by people with a calculator. */}
                <div className="flex flex-col items-start gap-1 rounded-lg border border-dashed border-line px-4 py-3">
                  <span className="num text-2xl leading-none tracking-tight text-ink">
                    &euro;{money(ENTERPRISE_SAVING)} less
                  </span>
                  <span className="max-w-[32ch] text-2xs leading-relaxed text-ink-3">
                    than {spell(ENTERPRISE_GYMS)} Plus accounts, which would be &euro;
                    {money(PRICES.plus * ENTERPRISE_GYMS)} a month.
                    {ENTERPRISE_MATCHES_BASE && (
                      <>
                        {' '}
                        It is what {spell(ENTERPRISE_GYMS)} gyms on{' '}
                        <strong className="font-medium text-ink">Base</strong> would cost, with
                        everything Plus has on all of them.
                      </>
                    )}
                  </span>
                </div>
              </div>
              <p className="max-w-[64ch] border-t border-line pt-4 text-2xs leading-relaxed text-ink-2">
                More than {spell(ENTERPRISE_GYMS)}? Tell us how many and we will price it. There is
                no ladder of tiers behind this. The number of gyms on an account is a number, and
                we set it to whatever you actually run.
              </p>
            </Panel>

            <p className="max-w-[64ch] text-2xs leading-relaxed text-ink-3">
              We invoice monthly and there is no card form anywhere in this product yet. Applying
              costs nothing, commits nothing, and is read by a person.
            </p>
          </div>
        </section>

        {/* ------------------------------------------------------------- Apply */}
        <section id="apply" className="scroll-mt-4 border-t border-line py-14 md:py-20">
          <div className={cn(READ, 'grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16')}>
            <div className="flex flex-col gap-5">
              <SectionHeading>Tell us about the gym.</SectionHeading>
              <Body className="max-w-[52ch]">
                A gym is a sync account: its messages live on the server, because they have to reach
                phones that are not in the building. So the first step is an account, and the second
                is this form.
              </Body>
              <ol className="flex flex-col gap-3 pt-1">
                {[
                  'Create a profile on this device, with a passphrase.',
                  'Sign in to sync, or open a sync account from the same panel.',
                  'Send the form. Somebody reads it and sets the gym up by hand.',
                ].map((step, i) => (
                  <li key={step} className="flex items-start gap-3 text-sm text-ink-2">
                    <span className="num mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-2xs text-ink-3">
                      {i + 1}
                    </span>
                    <span className="max-w-[44ch] leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
              <p className="max-w-[52ch] text-2xs leading-relaxed text-ink-3">
                Gyms are still set up by hand on purpose. Nothing you send here grants an account,
                and the provisioning we already do by script is unchanged.
              </p>
            </div>

            <ApplyPanel onUnlocked={onUnlocked} />
          </div>
        </section>

        <footer className="border-t border-line py-10">
          <div className={cn(READ, 'flex flex-wrap items-center justify-between gap-4')}>
            <Label>enForma for gyms</Label>
            <a
              href="/"
              className="text-sm text-brand underline-offset-2 hover:underline"
            >
              I want to train instead
            </a>
          </div>
        </footer>
      </main>
    </div>
  )
}

type Sent = { ok: true } | { ok: false; message: string } | null

/**
 * The form, and the account it needs.
 *
 * Two states rather than one form that fails at the end: without a sync session
 * there is nothing to attach an application to, so the panel says so and mounts
 * the gate instead of collecting eight fields and then refusing them.
 */
function ApplyPanel({ onUnlocked }: { onUnlocked?: () => void }) {
  const [signedIn, setSignedIn] = useState(() => activeAuthHeader() !== null)
  const [gymName, setGymName] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [size, setSize] = useState<string>(SIZES[1])
  const [plan, setPlan] = useState<'base' | 'plus' | 'enterprise'>('plus')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState<Sent>(null)

  const problems = useMemo(() => {
    const list: string[] = []
    if (gymName.trim().length < 2) list.push('the gym’s name')
    if (contact.trim().length < 2) list.push('who we should reply to')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) list.push('an email we can reach')
    return list
  }, [gymName, contact, email])

  const submit = () => {
    const auth = activeAuthHeader()
    const profile = activeProfile()
    /* The owner is the sync account, not the device profile. The create rule
       compares it against `@request.auth.id`, so a profile id here would be
       refused by the server and read as a broken form. */
    const link = profile ? readSyncLink(profile.id) : null
    if (!auth || !link?.userId) {
      setSignedIn(false)
      return
    }
    setBusy(true)
    setSent(null)
    void fetch(`${activeServer()}/api/collections/gym_applications/records`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        owner: link.userId,
        gym_name: gymName.trim(),
        contact: contact.trim(),
        email: email.trim(),
        phone: phone.trim(),
        city: city.trim(),
        size,
        plan,
        note: note.trim(),
        status: 'new',
      }),
    })
      .then(async (r) => {
        if (r.ok) {
          setSent({ ok: true })
          return
        }
        /* The unique index is the common failure and it is not an error worth
           a stack trace: they already applied and are waiting. */
        const body = (await r.json().catch(() => ({}))) as { message?: string }
        setSent({
          ok: false,
          message:
            r.status === 400 && /unique|already/i.test(JSON.stringify(body))
              ? 'You already have an application open. We have it, and somebody will reply to it.'
              : body.message ?? 'The server did not take it. Try again in a moment.',
        })
      })
      .catch(() =>
        setSent({ ok: false, message: 'No answer from the server. Check the connection and retry.' }),
      )
      .finally(() => setBusy(false))
  }

  if (!signedIn) {
    return (
      <Panel padding="lg" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-lg text-ink">First, an account</h3>
          <Body className="max-w-none">
            The form appears once this device has a sync account. Create a profile below, then use
            <span className="font-medium text-ink-2"> Sign in to sync</span> inside it.
          </Body>
        </div>
        {/* Unlocking here must tell the shell, or the app sits half-open: the
            profile is unlocked in `profiles` and still locked in the session
            store, so every other screen thinks nobody is in. It must not
            navigate, either — a fresh device makes its first profile the
            device admin, and the member landing's handler would send an
            applicant straight to /admin, off the form they were filling in. */}
        <AuthPanel
          idPrefix="gym"
          onUnlocked={() => {
            onUnlocked?.()
            setSignedIn(activeAuthHeader() !== null)
          }}
        />
      </Panel>
    )
  }

  if (sent?.ok) {
    return (
      <Panel padding="lg" className="flex flex-col items-start gap-3">
        <SealCheck size={24} weight="regular" className="text-brand" />
        <h3 className="text-lg text-ink">We have it.</h3>
        <Body className="max-w-none">
          Somebody reads these by hand, so the reply comes from a person and not from a queue. If
          your details change before then, tell us in the same thread.
        </Body>
      </Panel>
    )
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Gym name" value={gymName} onChange={(e) => setGymName(e.target.value)} placeholder="Hierro Viejo" />
        <Input label="Who we reply to" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Rosalía Pardiñas" />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="desk@hierroviejo.es" />
        <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" />
        <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bilbao" />
        <FormSelect
          label="Members"
          value={size}
          onValueChange={setSize}
          options={SIZES.map((s) => ({ value: s, label: s }))}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-2xs font-medium text-ink-3">Which plan brought you here</span>
        <div className="flex flex-wrap gap-1.5">
          {(['base', 'plus', 'enterprise'] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlan(key)}
              className={cn(
                'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-150',
                plan === key ? 'bg-brand text-brand-ink' : 'bg-surface-2 text-ink-3 hover:text-ink',
              )}
            >
              {key === 'base'
                ? `Base, €${PRICES.base}`
                : key === 'plus'
                  ? `Plus, €${PRICES.plus}`
                  : `Enterprise, €${money(PRICES.enterprise)}`}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="Anything else"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Two rooms, a kitchen, and a coach who writes the programmes."
      />

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="primary" disabled={busy || problems.length > 0} onClick={submit} className="active:translate-y-px">
          <PaperPlaneTilt size={16} />
          {busy ? 'Sending' : 'Send the application'}
        </Button>
        {problems.length > 0 && (
          <span className="text-2xs text-ink-3">Still needs {problems.join(', ')}.</span>
        )}
        {sent && !sent.ok && <span className="max-w-[40ch] text-2xs text-danger">{sent.message}</span>}
      </div>
    </Panel>
  )
}
