import { useCallback, useEffect, useState } from 'react'
import { Check, Key, X } from '@phosphor-icons/react'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { Tag } from '@/ui/Tag'
import { activeProfile } from '@/lib/profiles'
import {
  activeSyncUserId,
  decideJoinRequest,
  gymDesk,
  gymJoinCode,
  inviteOperator,
  operatedGymId,
  pendingJoinRequests,
  removeFromDesk,
  setGymJoinCode,
  type DeskRow,
  type JoinRequestRow,
} from '@/lib/sync'
import { SEATS_FOR, type GymPlan } from '@/lib/gym-plan'

/** Approve or decline members asking to join this gym. */
export function GymRequests() {
  const profileId = activeProfile()?.id ?? null
  const [requests, setRequests] = useState<JoinRequestRow[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const refresh = () => {
    if (profileId) pendingJoinRequests(profileId).then((r) => { setRequests(r); setLoaded(true) }).catch(() => setLoaded(true))
  }
  useEffect(refresh, [profileId])
  if (!profileId) return null

  const decide = async (id: string, approve: boolean) => {
    setBusy(id)
    try {
      await decideJoinRequest(profileId, id, approve)
      setRequests((rs) => rs.filter((r) => r.id !== id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Panel padding="lg">
      {requests.length === 0 ? (
        <p className="max-w-[44ch] text-sm text-ink-3">
          {loaded ? 'No one is waiting to join right now.' : 'Loading requests…'} Members without your
          join code land here for you to approve.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {requests.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <Avatar name={r.memberName ?? r.memberEmail ?? '?'} seed={r.owner} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">
                  {r.memberName ?? 'New member'}
                </span>
                <span className="block truncate text-2xs text-ink-3">{r.memberEmail}</span>
              </span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void decide(r.id, true)}
                disabled={busy === r.id}
              >
                <Check size={15} weight="bold" />
                Approve
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void decide(r.id, false)}
                disabled={busy === r.id}
              >
                <X size={15} />
                Decline
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Show and set the code that lets members join this gym instantly. */
export function GymJoinCode() {
  const profileId = activeProfile()?.id ?? null
  const [gymId, setGymId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profileId) return
    void operatedGymId(profileId).then((id) => {
      setGymId(id)
      if (id) void gymJoinCode(profileId, id).then((c) => { setSaved(c); if (c) setCode(c) }).catch(() => {})
    })
  }, [profileId])
  if (!profileId || !gymId) return null

  const save = async () => {
    if (busy || code.trim().length < 4) {
      setError('A join code needs at least 4 characters.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await setGymJoinCode(profileId, gymId, code)
      setSaved(code.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the code.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Key size={16} />
          Join code
        </h3>
        <p className="max-w-[60ch] text-2xs text-ink-3">
          Share this with your members and they join instantly. Anyone without it can still ask to
          join — you approve those under Requests.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div className="max-w-56 flex-1">
          <Input
            label="Code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={error ?? undefined}
          />
        </div>
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          {saved && saved === code.trim() ? 'Saved' : 'Set code'}
        </Button>
      </div>
    </Panel>
  )
}

/**
 * The desk: who can publish as this gym.
 *
 * One list for accounts and invitations, because to a person they are the same
 * thing — the people who can post — and whether a row is an account yet is how
 * far along it is, not a different kind of entry.
 *
 * Only the owner sees the controls. Every operator being able to edit the
 * roster means an invited one can remove whoever invited them, and the account
 * belongs to whoever moves first; the server refuses it either way, and hiding
 * the controls is so nobody is offered a button that will say no.
 */
export function OperatorRoster({ gymId, plan }: { gymId: string | null; plan: GymPlan }) {
  const profileId = activeProfile()?.id ?? null
  const [rows, setRows] = useState<DeskRow[] | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null)

  const refresh = useCallback(() => {
    if (!profileId || !gymId) return
    gymDesk(profileId, gymId).then(setRows).catch(() => setRows([]))
  }, [profileId, gymId])
  useEffect(refresh, [refresh])

  if (!profileId || !gymId) return null

  const seats = SEATS_FOR[plan]
  const mine = rows?.find((r) => !r.pending && r.isOwner)
  /* `owner` is the account, and this panel is that account's own view of it. */
  const iAmOwner = !!mine && rows !== null && mine.id === activeSyncUserId(profileId)

  const add = async () => {
    if (!email.trim() || busy) return
    setBusy(true)
    setStatus(null)
    try {
      const res = await inviteOperator(profileId, gymId, email)
      setEmail('')
      /* The same sentence whichever it was, because the difference is whether
         that address already has an account — which is not ours to tell. */
      setStatus({
        tone: 'good',
        text: res.joined
          ? 'Added. They can publish as soon as they open the app.'
          : 'Invited. They join the desk the first time they sign in.',
      })
      refresh()
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'That did not work.' })
    } finally {
      setBusy(false)
    }
  }

  const drop = async (row: DeskRow) => {
    setBusy(true)
    setStatus(null)
    try {
      await removeFromDesk(profileId, gymId, row)
      refresh()
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'That did not work.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">Who can publish</span>
        <span className="num text-2xs text-ink-3">
          {rows === null ? '' : `${rows.length} of ${seats}`}
        </span>
      </div>

      {rows === null ? (
        <span className="h-3 w-40 animate-pulse rounded bg-surface-2" />
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{row.email}</span>
              {row.isOwner && <Tag tone="outline">Owner</Tag>}
              {row.pending && <Tag tone="neutral">Invited</Tag>}
              {iAmOwner && !row.isOwner && (
                <Button
                  variant="dangerQuiet"
                  size="sm"
                  disabled={busy}
                  onClick={() => void drop(row)}
                >
                  {row.pending ? 'Withdraw' : 'Remove'}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {iAmOwner ? (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Add somebody"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="They need no account yet — the invitation waits for them."
            className="min-w-56 flex-1"
          />
          <Button variant="primary" disabled={busy || !email.trim()} onClick={() => void add()}>
            Invite
          </Button>
        </div>
      ) : (
        <p className="max-w-[56ch] text-2xs leading-relaxed text-ink-3">
          The account that holds this gym decides who works the desk.
        </p>
      )}

      {plan !== 'plus' && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-3">
          <Tag tone="outline">Plus</Tag>
          Base covers one person at the desk. Plus covers five.
        </p>
      )}

      {status && (
        <p
          role="status"
          className={
            status.tone === 'good'
              ? 'rounded-md bg-good-soft px-3 py-2 text-sm text-good'
              : 'rounded-md bg-danger-soft px-3 py-2 text-sm text-danger'
          }
        >
          {status.text}
        </p>
      )}
    </Panel>
  )
}
