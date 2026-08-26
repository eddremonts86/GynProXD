import { useMemo, useState } from 'react'
import { Navigate } from '@tanstack/react-router'
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react'
import { useSession } from '../store/useSession'
import { useMessages } from '../store/useMessages'
import {
  addGymToCatalogue,
  deleteGymEverywhere,
  deleteProfileById,
  listGyms,
  listProfiles,
  renameGymEverywhere,
  updateProfileMeta,
  type ProfileRole,
} from '../lib/profiles'
import { formatShortDate, pluralize } from '../lib/labels'
import { Avatar } from '../ui/Avatar'
import { Button, IconButton } from '../ui/Button'
import { Combobox } from '../ui/Combobox'
import { FormSelect } from '../ui/FormSelect'
import { Input } from '../ui/Input'
import { Panel } from '../ui/Panel'
import { PageHeader, Section } from '../ui/PageHeader'
import { Tag } from '../ui/Tag'

const ROLE_LABELS: Record<ProfileRole, string> = {
  member: 'Member',
  gym: 'Gym',
  admin: 'Admin',
}

/**
 * Global device administration. This governs the public layer — directory,
 * roles, gym catalogue, message bus. Encrypted training data is out of
 * reach by construction; deleting a profile removes its ciphertext unread.
 */
export function AdminPage() {
  const role = useSession((s) => s.role)
  const profileId = useSession((s) => s.profileId)
  if (role !== 'admin' || !profileId) return <Navigate to="/" />
  return <AdminDesk selfId={profileId} />
}

function AdminDesk({ selfId }: { selfId: string }) {
  const messages = useMessages((s) => s.messages)
  const removeByGym = useMessages((s) => s.removeByGym)
  const renameGymMessages = useMessages((s) => s.renameGym)
  const refreshMeta = useSession((s) => s.refreshMeta)

  const [profiles, setProfiles] = useState(listProfiles)
  const [gyms, setGyms] = useState(listGyms)
  const refresh = () => {
    setProfiles(listProfiles())
    setGyms(listGyms())
  }

  /* Users */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editGym, setEditGym] = useState('')
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null)

  /* Gyms */
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  const [confirmGym, setConfirmGym] = useState<string | null>(null)
  const [newGym, setNewGym] = useState('')

  const membersOf = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of profiles) {
      if (!p.gym) continue
      const key = p.gym.trim().toLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return counts
  }, [profiles])

  const messagesOf = (gym: string) =>
    messages.filter((m) => m.gym.trim().toLowerCase() === gym.trim().toLowerCase()).length

  const saveUser = () => {
    if (editingId && editName.trim()) {
      updateProfileMeta(editingId, { name: editName, gym: editGym })
      if (editingId === selfId) refreshMeta({ name: editName.trim(), gym: editGym.trim() })
      refresh()
    }
    setEditingId(null)
  }

  const setRole = (id: string, role: ProfileRole) => {
    updateProfileMeta(id, { role })
    refresh()
  }

  const doRename = () => {
    if (renaming && renameTo.trim()) {
      renameGymEverywhere(renaming, renameTo)
      renameGymMessages(renaming, renameTo)
      refresh()
    }
    setRenaming(null)
    setRenameTo('')
  }

  const doDeleteGym = (name: string) => {
    deleteGymEverywhere(name)
    removeByGym(name)
    setConfirmGym(null)
    refresh()
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Admin"
        description="The device's public layer: people, roles, gyms and the message bus. Encrypted training data stays sealed per profile."
      />

      <Section title="Overview">
        <Panel padding="lg">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              ['Profiles', profiles.length],
              ['Gyms', gyms.length],
              ['Messages', messages.length],
              ['Gym operators', profiles.filter((p) => p.role === 'gym').length],
            ].map(([label, value]) => (
              <div key={label as string} className="flex flex-col gap-0.5">
                <dt className="text-2xs text-ink-3">{label}</dt>
                <dd className="num text-xl font-semibold text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </Section>

      <Section title="Users" hint={pluralize(profiles.length, 'profile')}>
        <Panel padding="lg">
          <ul className="divide-y divide-line">
            {profiles.map((p) => (
              <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                {editingId === p.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault()
                      saveUser()
                    }}
                    className="flex flex-col gap-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Input
                        id={`admin-name-${p.id}`}
                        label="Name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <Combobox
                        id={`admin-gym-${p.id}`}
                        label="Gym"
                        value={editGym}
                        onValueChange={setEditGym}
                        options={gyms}
                        placeholder="Search or add"
                        createLabel="Add gym"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="submit" size="sm" disabled={!editName.trim()}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={p.name} seed={p.id} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{p.name}</span>
                        {p.id === selfId && <Tag tone="brand">You</Tag>}
                        {p.role !== 'member' && <Tag tone="outline">{ROLE_LABELS[p.role]}</Tag>}
                      </span>
                      <span className="block truncate text-2xs text-ink-3">
                        {p.gym ?? 'Independent'} ·{' '}
                        <span className="num">since {formatShortDate(p.createdAt.slice(0, 10))}</span>
                      </span>
                    </span>

                    <FormSelect
                      ariaLabel={`Role for ${p.name}`}
                      size="sm"
                      value={p.role}
                      onValueChange={(v) => setRole(p.id, v as ProfileRole)}
                      options={(['member', 'gym', 'admin'] as const).map((r) => ({
                        value: r,
                        label: ROLE_LABELS[r],
                      }))}
                      className={p.id === selfId ? 'w-32 pointer-events-none opacity-45' : 'w-32'}
                    />

                    {confirmUserId === p.id ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setConfirmUserId(null)}>
                          Cancel
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            void deleteProfileById(p.id).then(refresh)
                          }}
                        >
                          Delete
                        </Button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1">
                        <IconButton
                          aria-label={`Edit ${p.name}`}
                          onClick={() => {
                            setEditingId(p.id)
                            setEditName(p.name)
                            setEditGym(p.gym ?? '')
                            setConfirmUserId(null)
                          }}
                        >
                          <PencilSimple size={15} />
                        </IconButton>
                        {p.id !== selfId && (
                          <IconButton
                            aria-label={`Delete ${p.name}`}
                            onClick={() => setConfirmUserId(p.id)}
                          >
                            <Trash size={15} />
                          </IconButton>
                        )}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="border-t border-line pt-3 text-2xs text-ink-3">
            Your own role stays fixed here so the device never loses its administrator by
            accident. Deleting a profile erases its encrypted data permanently.
          </p>
        </Panel>
      </Section>

      <Section title="Gyms" hint={pluralize(gyms.length, 'gym')}>
        <Panel padding="lg" className="flex flex-col gap-3">
          {gyms.length === 0 ? (
            <p className="text-sm text-ink-3">No gyms yet. Add the first one below.</p>
          ) : (
            <ul className="divide-y divide-line">
              {gyms.map((g) => (
                <li key={g} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {renaming === g ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault()
                        doRename()
                      }}
                      className="flex flex-1 items-center gap-2"
                    >
                      <Input
                        aria-label={`New name for ${g}`}
                        value={renameTo}
                        onChange={(e) => setRenameTo(e.target.value)}
                        autoFocus
                        className="h-9"
                      />
                      <Button type="submit" size="sm" disabled={!renameTo.trim()}>
                        Rename
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{g}</span>
                        <span className="num block text-2xs text-ink-3">
                          {pluralize(membersOf.get(g.toLowerCase()) ?? 0, 'profile')} ·{' '}
                          {pluralize(messagesOf(g), 'message')}
                        </span>
                      </span>
                      {confirmGym === g ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setConfirmGym(null)}>
                            Cancel
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => doDeleteGym(g)}>
                            Delete gym
                          </Button>
                        </span>
                      ) : (
                        <span className="flex shrink-0 items-center gap-1">
                          <IconButton
                            aria-label={`Rename ${g}`}
                            onClick={() => {
                              setRenaming(g)
                              setRenameTo(g)
                              setConfirmGym(null)
                            }}
                          >
                            <PencilSimple size={15} />
                          </IconButton>
                          <IconButton aria-label={`Delete ${g}`} onClick={() => setConfirmGym(g)}>
                            <Trash size={15} />
                          </IconButton>
                        </span>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (newGym.trim()) {
                addGymToCatalogue(newGym)
                setNewGym('')
                refresh()
              }
            }}
            className="flex items-center gap-2 border-t border-line pt-3"
          >
            <Input
              aria-label="New gym name"
              value={newGym}
              onChange={(e) => setNewGym(e.target.value)}
              placeholder="Add a gym to the catalogue"
              className="h-9"
            />
            <Button type="submit" variant="secondary" size="sm" disabled={!newGym.trim()}>
              <Plus size={14} weight="bold" />
              Add
            </Button>
          </form>
          <p className="text-2xs text-ink-3">
            Renaming a gym updates the catalogue and every profile that points at it. Deleting
            unassigns its members and removes its messages.
          </p>
        </Panel>
      </Section>
    </div>
  )
}
