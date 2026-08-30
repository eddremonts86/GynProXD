import { useEffect, useState } from 'react'
import { CheckCircle, Hourglass, MagnifyingGlass, Storefront } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'
import { Input } from '@/ui/Input'
import { Panel } from '@/ui/Panel'
import { activeProfile } from '@/lib/profiles'
import { useSession } from '@/store/useSession'
import {
  joinWithCode,
  leaveGym,
  myJoinRequests,
  readSyncLink,
  requestToJoin,
  searchGyms,
  type GymOption,
  type JoinRequestRow,
} from '@/lib/sync'

/**
 * How a synced member joins a gym: with the code the gym shares (instant) or
 * by asking the operator to approve. Joining is gated on the server, so this
 * is the only door — a member can no longer simply assign themselves a gym.
 * Local-only profiles (no sync) still set their gym in onboarding as before.
 */
export function GymMembership() {
  const profileId = activeProfile()?.id ?? null
  const gym = useSession((s) => s.gym)
  const role = useSession((s) => s.role)
  const [requests, setRequests] = useState<JoinRequestRow[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GymOption[]>([])
  const [picked, setPicked] = useState<GymOption | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ tone: 'good' | 'danger'; text: string } | null>(null)

  const linked = profileId ? readSyncLink(profileId) : null

  const refresh = () => {
    if (profileId) myJoinRequests(profileId).then(setRequests).catch(() => {})
  }
  useEffect(refresh, [profileId])

  // Operators manage their own gym from the Gym panel, not here.
  if (!profileId || !linked || role === 'gym') return null

  const pending = requests.find((r) => r.status === 'pending')

  const runSearch = async () => {
    if (!query.trim()) return
    setBusy(true)
    setStatus(null)
    try {
      setResults(await searchGyms(profileId, query))
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Search failed.' })
    } finally {
      setBusy(false)
    }
  }

  const doJoinCode = async () => {
    if (!picked || busy) return
    setBusy(true)
    setStatus(null)
    try {
      await joinWithCode(profileId, picked, code)
      setStatus({ tone: 'good', text: `Joined ${picked.name}.` })
      setPicked(null)
      setCode('')
      setResults([])
      setQuery('')
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'That code did not work.' })
    } finally {
      setBusy(false)
    }
  }

  const doRequest = async () => {
    if (!picked || busy) return
    setBusy(true)
    setStatus(null)
    try {
      await requestToJoin(profileId, picked)
      setStatus({ tone: 'good', text: `Request sent to ${picked.name}. You will join once they approve.` })
      setPicked(null)
      setResults([])
      setQuery('')
      refresh()
    } catch (e) {
      setStatus({ tone: 'danger', text: e instanceof Error ? e.message : 'Could not send the request.' })
    } finally {
      setBusy(false)
    }
  }

  const doLeave = async () => {
    if (busy) return
    setBusy(true)
    setStatus(null)
    try {
      await leaveGym(profileId)
      setStatus({ tone: 'good', text: 'You left the gym.' })
      refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel padding="lg" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <Storefront size={18} />
          Gym membership
        </h2>
        <p className="max-w-[62ch] text-sm text-ink-3">
          {gym
            ? `You are a member of ${gym}. Its announcements, menus and offers reach your inbox.`
            : 'Join your gym with the code it gave you, or ask it to approve you. Only then does its bus reach you.'}
        </p>
      </div>

      {gym ? (
        <div>
          <Button variant="dangerQuiet" size="sm" onClick={() => void doLeave()} disabled={busy}>
            Leave {gym}
          </Button>
        </div>
      ) : pending ? (
        <p className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-ink-2">
          <Hourglass size={16} />
          Your request is waiting for the gym to approve it.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void runSearch()
            }}
          >
            <div className="flex-1">
              <Input
                label="Find your gym"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name"
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || !query.trim()}>
              <MagnifyingGlass size={16} />
              Search
            </Button>
          </form>

          {results.length > 0 && !picked && (
            <ul className="flex flex-col gap-1.5">
              {results.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(g)}
                    className="w-full rounded-md bg-surface-2 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-line/60"
                  >
                    {g.name}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked && (
            <div className="flex flex-col gap-3 rounded-md border border-line p-3">
              <p className="text-sm font-medium text-ink">Join {picked.name}</p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Join code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    hint="If your gym gave you one, it joins you instantly."
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => void doJoinCode()}
                  disabled={busy || !code.trim()}
                >
                  Join
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void doRequest()} disabled={busy}>
                  No code — ask to be approved
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPicked(null)
                    setCode('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {status && (
        <p
          role="status"
          className={
            status.tone === 'good'
              ? 'flex items-center gap-2 rounded-md bg-good-soft px-3 py-2 text-sm text-good'
              : 'rounded-md bg-danger-soft px-3 py-2 text-sm text-danger'
          }
        >
          {status.tone === 'good' && <CheckCircle size={16} />}
          {status.text}
        </p>
      )}
    </Panel>
  )
}
