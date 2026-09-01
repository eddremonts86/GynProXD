import { useCallback, useEffect, useState } from 'react'
import { ArrowSquareOut, Buildings, WarningCircle } from '@phosphor-icons/react'
import { activeAuthHeader, activeServer } from '../lib/sync'
import { formatShortDate } from '../lib/labels'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { Tag } from '../ui/Tag'
import { EmptyState } from '../ui/EmptyState'
import { FormSelect } from '../ui/FormSelect'

/**
 * Gyms asking to be set up.
 *
 * The landing page collects these and nothing else happens on its own: no gym
 * is created, no account is granted. Somebody reads the row and runs the same
 * provisioning script as before, which is why the only control here is the
 * status — this panel records what a person did, it does not do it.
 *
 * A queue nobody can see is a form that throws applications away, so this
 * exists the moment the form does rather than a release later.
 */

interface Row {
  id: string
  gym_name: string
  contact: string
  email: string
  phone: string
  city: string
  size: string
  plan: string
  note: string
  status: string
  created: string
}

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'provisioned', label: 'Provisioned' },
  { value: 'declined', label: 'Declined' },
] as const

const TONE: Record<string, 'brand' | 'good' | 'neutral' | 'danger'> = {
  new: 'brand',
  contacted: 'neutral',
  provisioned: 'good',
  declined: 'danger',
}

export function AdminApplications() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const base = activeServer()
  const auth = activeAuthHeader()

  const load = useCallback(() => {
    if (!auth) return
    void fetch(`${base}/api/collections/gym_applications/records?perPage=200&sort=-created`, {
      headers: auth,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { items: Row[] }) => {
        setRows(data.items)
        setError(null)
      })
      .catch(() => setError('The sync server did not answer.'))
  }, [auth, base])

  useEffect(load, [load])

  const setStatus = useCallback(
    async (row: Row, status: string) => {
      if (!auth) return
      setBusy(row.id)
      await fetch(`${base}/api/collections/gym_applications/records/${row.id}`, {
        method: 'PATCH',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setBusy(null)
      load()
    },
    [auth, base, load],
  )

  if (!auth) {
    return (
      <EmptyState
        icon={<WarningCircle size={20} />}
        title="Sign in to sync first"
        description="Applications arrive on the sync server, not on this device. Settings → Data → Sync."
      />
    )
  }

  if (error) return <p className="text-sm text-danger">{error}</p>

  if (rows === null) {
    return (
      <Panel padding="lg" className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="flex flex-col gap-2 py-3">
            <span className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
            <span className="h-2.5 w-1/2 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </Panel>
    )
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Buildings size={20} />}
        title="Nobody has applied yet"
        description="The gym landing at /for-gyms collects these. Provisioning is still by hand, and unchanged."
      />
    )
  }

  const open = rows.filter((r) => r.status === 'new').length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-2xs text-ink-3">
        {open > 0 ? `${open} waiting for a first reply. ` : 'Nothing waiting. '}
        Nothing here creates a gym — set it up the way you always have, then mark the row.
      </p>

      <Panel padding="lg" className="flex flex-col">
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{row.gym_name}</span>
                    <Tag tone={TONE[row.status] ?? 'neutral'}>
                      {STATUSES.find((s) => s.value === row.status)?.label ?? row.status}
                    </Tag>
                    <Tag tone="outline">{row.plan === 'base' ? 'Base, €200' : 'Plus, €300'}</Tag>
                  </span>
                  <span className="text-2xs text-ink-3">
                    {row.contact}
                    {row.city ? ` · ${row.city}` : ''}
                    {row.size ? ` · ${row.size} members` : ''} ·{' '}
                    <span className="num">{formatShortDate(row.created.slice(0, 10))}</span>
                  </span>
                </div>
                <FormSelect
                  ariaLabel={`Status of ${row.gym_name}`}
                  size="sm"
                  value={row.status}
                  onValueChange={(v) => void setStatus(row, v)}
                  options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                  className="w-40 shrink-0"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                {/* The whole point of the row: a way to answer it. */}
                <a
                  href={`mailto:${row.email}?subject=${encodeURIComponent(`enForma — ${row.gym_name}`)}`}
                  className="flex items-center gap-1.5 text-2xs text-brand underline-offset-2 hover:underline"
                >
                  {row.email}
                  <ArrowSquareOut size={12} weight="bold" />
                </a>
                {row.phone && <span className="num text-2xs text-ink-3">{row.phone}</span>}
              </div>

              {row.note && (
                <p className="max-w-[68ch] rounded-lg bg-surface-2 px-3 py-2 text-2xs leading-relaxed text-ink-2">
                  {row.note}
                </p>
              )}

              {busy === row.id && <span className="text-2xs text-ink-3">Saving…</span>}
            </li>
          ))}
        </ul>
      </Panel>

      <div>
        <Button variant="ghost" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>
    </div>
  )
}
