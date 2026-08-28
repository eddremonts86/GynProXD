import { useEffect, useState } from 'react'
import { Check, Key, X } from '@phosphor-icons/react'
import { Avatar } from '@/ui/Avatar'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { activeProfile } from '@/lib/profiles'
import {
  decideJoinRequest,
  gymJoinCode,
  operatedGymId,
  pendingJoinRequests,
  setGymJoinCode,
  type JoinRequestRow,
} from '@/lib/sync'

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
              <Button size="sm" onClick={() => void decide(r.id, true)} disabled={busy === r.id}>
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
        <Button onClick={() => void save()} disabled={busy}>
          {saved && saved === code.trim() ? 'Saved' : 'Set code'}
        </Button>
      </div>
    </Panel>
  )
}
