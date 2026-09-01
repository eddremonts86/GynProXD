import { HouseLine, Megaphone, Users, Warning } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import type { AudienceSplit } from '../lib/messages'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { cn } from '@/lib/utils'

/** Just the noun. The count is already set beside it, in a bigger size. */
const people = (n: number) => (n === 1 ? 'person' : 'people')

/** The two audiences the platform has. A gym never sees either. */
export type BroadcastScope = 'unaffiliated' | 'everyone'

/**
 * Who am I talking to, asked before there is anything to say.
 *
 * A radio pair above a composer would have been less code and it is the
 * version that eventually goes wrong: one control, two outcomes, and the
 * dangerous one a single mis-click away at the end of a long evening. So the
 * choice is a door instead. You walk through one of two, the composer you land
 * in is visibly not the other one, and going wider is a deliberate trip back.
 *
 * Both counts are read from the directory at the moment of asking. An audience
 * described in words is a guess; an audience with a number beside it is a
 * decision.
 */
export function BroadcastAudience({
  split,
  onPick,
}: {
  split: AudienceSplit
  onPick: (scope: BroadcastScope) => void
}) {
  const still = useReducedMotion()

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[62ch] text-sm leading-relaxed text-ink-2">
        enForma speaks to two groups and they are kept apart on purpose. Somebody who already pays a
        gym should not be reading a discount from us next to their own gym&rsquo;s.
      </p>

      {/* Deliberately unequal. The safe audience is the reason this exists and
          gets the room; going wider is the narrower door. */}
      <div className="grid gap-4 md:grid-cols-[1.35fr_1fr]">
        <Door
          index={0}
          still={still}
          icon={<HouseLine size={18} weight="bold" />}
          name="Members with no gym"
          count={split.unaffiliated}
          action="Write to them"
          onPick={() => onPick('unaffiliated')}
          primary
        >
          No gym has claimed them, and until now they received nothing at all — the inbox, the
          banners and the notifications were all built and all silent. This is the only audience
          that can be sold to without stepping on anybody.
        </Door>

        <Door
          index={1}
          still={still}
          icon={<Megaphone size={18} weight="bold" />}
          name="Everyone"
          count={split.total}
          action="Write to everyone"
          onPick={() => onPick('everyone')}
        >
          Service news, closures, a platform-wide challenge. Anything every member needs to know
          whether or not they train somewhere.
          {split.affiliated > 0 && (
            <span className="mt-2 flex items-start gap-1.5 text-ink-2">
              <Warning size={13} weight="bold" className="mt-px shrink-0" />
              <span>
                Includes{' '}
                <strong className="num font-medium text-ink">{split.affiliated}</strong> who already
                train at a gym.
              </span>
            </span>
          )}
        </Door>
      </div>
    </div>
  )
}

function Door({
  icon,
  name,
  count,
  children,
  action,
  onPick,
  primary = false,
  index,
  still,
}: {
  icon: React.ReactNode
  name: string
  count: number
  children: React.ReactNode
  action: string
  onPick: () => void
  primary?: boolean
  index: number
  still: boolean | null
}) {
  return (
    <motion.div
      initial={still ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20, delay: index * 0.06 }}
    >
      <Panel
        tone={primary ? 'raised' : 'quiet'}
        padding="lg"
        className="flex h-full flex-col gap-4"
      >
        <div className="flex items-center gap-2 text-ink-2">
          <span className={primary ? 'text-brand' : 'text-ink-3'}>{icon}</span>
          <h3 className="text-sm font-medium text-ink">{name}</h3>
        </div>

        <div className="flex items-baseline gap-2">
          <span className={cn('num tabular-nums text-ink', primary ? 'text-5xl' : 'text-4xl')}>
            {count}
          </span>
          <span className="text-2xs text-ink-3">{people(count)}</span>
        </div>

        <p className="flex-1 text-2xs leading-relaxed text-ink-3">{children}</p>

        <Button
          variant={primary ? 'primary' : 'secondary'}
          onClick={onPick}
          className="self-start active:translate-y-px"
        >
          {action}
        </Button>
      </Panel>
    </motion.div>
  )
}

/**
 * Which audience the open composer is aimed at, kept on screen the whole time.
 *
 * Not a label — a reminder with a way out. The wider audience reads visibly
 * different, because the failure this feature is built around is somebody
 * typing an offer while thinking about the other group.
 */
export function AudienceStrip({
  scope,
  split,
  onChange,
}: {
  scope: BroadcastScope
  split: AudienceSplit
  onChange: () => void
}) {
  const wide = scope === 'everyone'
  const count = wide ? split.total : split.unaffiliated
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3 py-2.5',
        wide ? 'border border-line-strong bg-surface-2' : 'border border-dashed border-line',
      )}
    >
      <span className={wide ? 'text-ink-2' : 'text-ink-3'}>
        {wide ? <Megaphone size={14} weight="bold" /> : <Users size={14} weight="bold" />}
      </span>
      <p className="flex-1 text-2xs leading-relaxed text-ink-2">
        Writing to{' '}
        <strong className="font-medium text-ink">
          {wide ? 'everyone' : 'members with no gym'}
        </strong>{' '}
        — <span className="num">{count}</span> {people(count)} on this device
        {wide && split.affiliated > 0 && (
          <>
            , <span className="num">{split.affiliated}</span> of them at a gym
          </>
        )}
        .
      </p>
      <Button variant="ghost" size="sm" onClick={onChange}>
        Change
      </Button>
    </div>
  )
}

/**
 * The last thing between a discount and somebody else's paying member.
 *
 * "Are you sure?" is a question nobody has answered no to. This one does not
 * ask; it states the number and then offers the message you probably meant, so
 * the easy path out is the correct one rather than the abandonment of ten
 * minutes of typing. Sending it anyway stays available and stays second.
 */
export function CommercialConfirm({
  split,
  kindLabel,
  onNarrow,
  onSendAnyway,
  onCancel,
}: {
  split: AudienceSplit
  kindLabel: string
  onNarrow: () => void
  onSendAnyway: () => void
  onCancel: () => void
}) {
  return (
    <Panel tone="inset" padding="lg" className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <Warning size={16} weight="bold" className="mt-0.5 shrink-0 text-ink-2" />
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-medium text-ink">
            This {kindLabel.toLowerCase()} reaches people who already pay a gym
          </h3>
          <p className="max-w-[62ch] text-2xs leading-relaxed text-ink-2">
            It goes to <strong className="num font-medium text-ink">{split.total}</strong> people.{' '}
            <strong className="num font-medium text-ink">{split.affiliated}</strong> of them train at
            a gym and will see it next to their own gym&rsquo;s messages. The other{' '}
            <span className="num">{split.unaffiliated}</span> have no gym at all.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={onNarrow} className="active:translate-y-px">
          Only the {split.unaffiliated} with no gym
        </Button>
        <Button variant="secondary" onClick={onSendAnyway} className="active:translate-y-px">
          Send to all {split.total}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Keep editing
        </Button>
      </div>
    </Panel>
  )
}
