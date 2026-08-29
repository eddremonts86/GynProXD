import type { ReactNode } from 'react'
import { Barbell, ChatCircleDots, ShieldCheck, UsersThree, WarningCircle } from '@phosphor-icons/react'
import { AuroraTile } from '../ui/AuroraTile'
import { Panel } from '../ui/Panel'
import { Stat } from '../ui/Stat'
import { Tag } from '../ui/Tag'
import { isoDaysAgo } from '../lib/dates'
import { formatShortDate, pluralize } from '../lib/labels'
import { TEMPLATE_LABELS, type GymMessage } from '../lib/messages'
import type { GymMenu } from '../lib/menu'
import type { ProfileSummary } from '../lib/profiles'
import { cn } from '@/lib/utils'

const sameKey = (a: string | undefined, b: string | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/** A titled chalk panel, the overview's repeating unit. */
function Widget({
  title,
  icon,
  hint,
  children,
}: {
  title: string
  icon: ReactNode
  hint?: string
  children: ReactNode
}) {
  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <header className="flex items-center gap-2">
        <span className="text-ink-3">{icon}</span>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {hint && <span className="num ml-auto text-2xs text-ink-3">{hint}</span>}
      </header>
      {children}
    </Panel>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>
}

/**
 * A dashboard for the device's public layer. Everything here is computed from
 * data the admin may see by construction — the directory, gym catalogue,
 * message bus and menus. Encrypted training data never enters this view, so
 * the widgets measure the *system*, not any person's workouts.
 */
export function AdminOverview({
  profiles,
  gyms,
  messages,
  menus,
}: {
  profiles: ProfileSummary[]
  gyms: string[]
  messages: GymMessage[]
  menus: GymMenu[]
}) {
  const admins = profiles.filter((p) => p.role === 'admin').length
  const operators = profiles.filter((p) => p.role === 'gym').length
  const members = profiles.filter((p) => p.role === 'member').length
  const independent = profiles.filter((p) => !p.gym).length
  const inGym = profiles.length - independent

  const roleParts = [
    admins > 0 && pluralize(admins, 'admin'),
    operators > 0 && pluralize(operators, 'operator'),
    members > 0 && pluralize(members, 'member'),
  ].filter(Boolean) as string[]

  const weekAgo = isoDaysAgo(6)
  const messagesThisWeek = messages.filter((m) => m.createdAt.slice(0, 10) >= weekAgo).length

  /* One row per gym, richest first, carrying the signals every widget below
     reads: how many people point at it, how loud its bus is, whether anyone
     runs it. */
  const perGym = gyms
    .map((gym) => ({
      gym,
      people: profiles.filter((p) => sameKey(p.gym, gym)).length,
      messages: messages.filter((m) => sameKey(m.gym, gym)).length,
      hasOperator: profiles.some((p) => p.role === 'gym' && sameKey(p.gym, gym)),
      hasMenu: menus.some((m) => sameKey(m.gym, gym)),
    }))
    .sort((a, b) => b.people - a.people)
  const maxPeople = Math.max(1, ...perGym.map((g) => g.people))

  const recent = messages.slice(0, 5)

  /* Gaps a directory can drift into. None of these can be read from a single
     counter, which is exactly why they earn a widget. */
  const issues: string[] = []
  for (const p of profiles)
    if (p.role === 'gym' && !p.gym) issues.push(`${p.name} is a gym operator with no gym assigned`)
  for (const g of perGym) {
    if (g.people > 0 && !g.hasOperator) issues.push(`${g.gym} has members but no operator`)
    if (g.people === 0) issues.push(`${g.gym} has no members yet`)
  }

  const roleBar = [
    { label: 'Admins', n: admins, cls: 'bg-brand' },
    { label: 'Operators', n: operators, cls: 'bg-ink-3' },
    { label: 'Members', n: members, cls: 'bg-line-strong' },
  ]

  return (
    <div className="flex flex-col gap-8">
      {/* Colour lives only here: the two structural headlines. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AuroraTile
          tone="green"
          label="People on this device"
          value={profiles.length}
          sub={roleParts.join(' · ')}
        />
        <AuroraTile
          tone="orange"
          label="Gyms in the network"
          value={gyms.length > 0 ? gyms.length : undefined}
          sub={
            gyms.length > 0
              ? `${inGym} in a gym · ${independent} independent`
              : 'No gyms in the catalogue yet. Add one from the Gyms tab.'
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Panel padding="md">
          <Stat label="Gym operators" value={operators} hint={operators === 0 ? 'None yet' : 'run a gym'} />
        </Panel>
        <Panel padding="md">
          <Stat label="In a gym" value={inGym} hint={`${independent} independent`} />
        </Panel>
        <Panel padding="md">
          <Stat
            label="Messages"
            value={messages.length}
            hint={messagesThisWeek > 0 ? `${messagesThisWeek} this week` : 'Quiet this week'}
          />
        </Panel>
        <Panel padding="md">
          <Stat
            label="Menus"
            value={menus.length}
            hint={menus.length === 0 ? 'None published' : `for ${pluralize(menus.length, 'gym')}`}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Roles" icon={<UsersThree size={16} />} hint={pluralize(profiles.length, 'profile')}>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
            {roleBar
              .filter((r) => r.n > 0)
              .map((r) => (
                <span
                  key={r.label}
                  className={cn('h-full', r.cls)}
                  style={{ width: `${(r.n / Math.max(1, profiles.length)) * 100}%` }}
                />
              ))}
          </div>
          <ul className="flex flex-col gap-2">
            {roleBar.map((r) => (
              <li key={r.label} className="flex items-center gap-2 text-sm">
                <span className={cn('size-2.5 rounded-full', r.cls)} />
                <span className="text-ink-2">{r.label}</span>
                <span className="num ml-auto font-semibold text-ink">{r.n}</span>
              </li>
            ))}
          </ul>
        </Widget>

        <Widget title="Members per gym" icon={<Barbell size={16} />} hint={pluralize(gyms.length, 'gym')}>
          {perGym.length === 0 ? (
            <Empty>No gyms to distribute people across yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {perGym.slice(0, 5).map((g) => (
                <li key={g.gym} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-ink">{g.gym}</span>
                    {!g.hasOperator && <Tag tone="outline">no operator</Tag>}
                    <span className="num ml-auto shrink-0 text-2xs text-ink-3">
                      {pluralize(g.people, 'member')} · {pluralize(g.messages, 'msg')}
                    </span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(g.people / maxPeople) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
              {perGym.length > 5 && (
                <li className="num text-2xs text-ink-3">+{perGym.length - 5} more</li>
              )}
            </ul>
          )}
        </Widget>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget
          title="Recent activity"
          icon={<ChatCircleDots size={16} />}
          hint={pluralize(messages.length, 'message')}
        >
          {recent.length === 0 ? (
            <Empty>The message bus is quiet. Gym broadcasts show up here.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-ink">{m.title}</span>
                    <span className="truncate text-2xs text-ink-3">{m.gym}</span>
                  </span>
                  <Tag tone="outline">{TEMPLATE_LABELS[m.kind]}</Tag>
                  <span className="num shrink-0 text-2xs text-ink-3">
                    {formatShortDate(m.createdAt.slice(0, 10))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Widget>

        <Widget
          title="Needs attention"
          icon={<WarningCircle size={16} />}
          hint={issues.length > 0 ? String(issues.length) : undefined}
        >
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <ShieldCheck size={18} weight="fill" className="shrink-0 text-good" />
              Everything&apos;s wired up. No gaps in the directory.
            </div>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {issues.slice(0, 6).map((text) => (
                <li key={text} className="flex items-start gap-2 text-sm text-ink-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-danger" />
                  {text}
                </li>
              ))}
              {issues.length > 6 && (
                <li className="num text-2xs text-ink-3">+{issues.length - 6} more</li>
              )}
            </ul>
          )}
        </Widget>
      </div>
    </div>
  )
}
