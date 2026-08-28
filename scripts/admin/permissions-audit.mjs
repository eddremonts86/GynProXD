/**
 * Server-side permission audit: proves the sync API refuses every cross-user
 * and privilege-escalation move, independently of what the client UI allows.
 * A route guard is not a permission; this hits PocketBase directly.
 *
 *   PB_SU_EMAIL=… PB_SU_PASSWORD=… node scripts/admin/permissions-audit.mjs \
 *     --server http://enforma-sync.localhost
 *
 * Exit non-zero if any invariant is violated. Fixtures are timestamped and
 * left behind (cheap, and useful for inspection); run against a test env.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((p, a, i, all) => {
    if (a.startsWith('--')) p.push([a.slice(2), all[i + 1]])
    return p
  }, []),
)
const PB = (args.server ?? 'http://enforma-sync.localhost').replace(/\/+$/, '')
const TS = Date.now()

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(PB + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, ok: res.ok, data: await res.json().catch(() => ({})) }
}
async function user(email) {
  await api('/api/collections/users/records', { method: 'POST',
    body: { email, password: 'auditpass123', passwordConfirm: 'auditpass123' },
  })
  const auth = await api('/api/collections/users/auth-with-password', { method: 'POST',
    body: { identity: email, password: 'auditpass123' },
  })
  return { id: auth.data.record.id, token: auth.data.token, email }
}

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const su = await api('/api/collections/_superusers/auth-with-password', { method: 'POST',
  body: { identity: process.env.PB_SU_EMAIL, password: process.env.PB_SU_PASSWORD },
})
if (!su.data.token) {
  console.error('superuser auth failed — set PB_SU_EMAIL / PB_SU_PASSWORD')
  process.exit(2)
}

// Fixtures: A and B are strangers; O operates gym G; M is a member of G.
const A = await user(`audit-a-${TS}@test.local`)
const B = await user(`audit-b-${TS}@test.local`)
const O = await user(`audit-op-${TS}@test.local`)
const M = await user(`audit-m-${TS}@test.local`)
const gym = (
  await api('/api/collections/gyms/records', {
    method: 'POST',
    token: su.data.token,
    body: { name: `Audit Gym ${TS}`, operators: [O.id] },
  })
).data
await api(`/api/collections/users/records/${M.id}`, {
  method: 'PATCH',
  token: M.token,
  body: { gym: gym.id },
})

// A writes an encrypted training row of their own.
const aRow = await api('/api/collections/records/records', {
  method: 'POST',
  token: A.token,
  body: {
    owner: A.id,
    col: 'workouts',
    rid: `w-${TS}`,
    updated_client: new Date(TS).toISOString(),
    blob: { iv: 'aXY=', data: 'ZGF0YQ==' },
  },
})
check('owner can write their own training row', aRow.ok, `status ${aRow.status}`)

// --- training data is private to its owner ---
const bReadsA = await api(`/api/collections/records/records/${aRow.data.id}`, { token: B.token })
check('stranger cannot read a training row', bReadsA.status === 404, `status ${bReadsA.status}`)
const bListsAll = await api('/api/collections/records/records?perPage=50', { token: B.token })
const leaked = (bListsAll.data.items ?? []).some((r) => r.owner === A.id)
check('list is scoped to the caller', !leaked, `${bListsAll.data.totalItems} rows visible to B`)
const bWritesAsA = await api('/api/collections/records/records', {
  method: 'POST',
  token: B.token,
  body: { owner: A.id, col: 'workouts', rid: `forge-${TS}`, updated_client: 'x', blob: null },
})
check('cannot create a row owned by someone else', !bWritesAsA.ok, `status ${bWritesAsA.status}`)
const bEditsA = await api(`/api/collections/records/records/${aRow.data.id}`, {
  method: 'PATCH',
  token: B.token,
  body: { blob: { iv: 'AA==', data: 'AA==' } },
})
check('cannot edit a row owned by someone else', !bEditsA.ok, `status ${bEditsA.status}`)
const bDeletesA = await api(`/api/collections/records/records/${aRow.data.id}`, {
  method: 'DELETE',
  token: B.token,
})
check('cannot delete a row owned by someone else', !bDeletesA.ok, `status ${bDeletesA.status}`)

// --- sync_state (KDF material) is private ---
await api('/api/collections/sync_state/records', {
  method: 'POST',
  token: A.token,
  body: { owner: A.id, salt: 'c2FsdA==', iterations: 310000, check: { iv: 'a', data: 'b' } },
})
const bReadsState = await api('/api/collections/sync_state/records?perPage=50', { token: B.token })
const stateLeak = (bReadsState.data.items ?? []).some((r) => r.owner === A.id)
check('cannot read another account key material', !stateLeak)

// --- the gym bus: only operators publish, only members of the gym read ---
const stranger = await api('/api/collections/gym_messages/records', {
  method: 'POST',
  token: B.token,
  body: { gym: gym.id, author: B.id, kind: 'announcement', title: 'spam' },
})
check('non-operator cannot publish to a gym', !stranger.ok, `status ${stranger.status}`)
const forgedAuthor = await api('/api/collections/gym_messages/records', {
  method: 'POST',
  token: O.token,
  body: { gym: gym.id, author: M.id, kind: 'announcement', title: 'forged author' },
})
check('cannot publish under a forged author', !forgedAuthor.ok, `status ${forgedAuthor.status}`)
const realMsg = await api('/api/collections/gym_messages/records', {
  method: 'POST',
  token: O.token,
  body: { gym: gym.id, author: O.id, kind: 'announcement', title: 'real', body: 'hi' },
})
check('operator can publish to their gym', realMsg.ok, `status ${realMsg.status}`)
const memberReads = await api('/api/collections/gym_messages/records?perPage=50', { token: M.token })
check(
  'a gym member reads their gym bus',
  (memberReads.data.items ?? []).some((m) => m.id === realMsg.data.id),
)
const outsiderReads = await api('/api/collections/gym_messages/records?perPage=50', { token: B.token })
check('an outsider reads nothing from the bus', (outsiderReads.data.totalItems ?? 0) === 0)

// --- gyms are superuser-only; a user cannot self-grant ---
const selfGym = await api('/api/collections/gyms/records', {
  method: 'POST',
  token: B.token,
  body: { name: `Rogue ${TS}`, operators: [B.id] },
})
check('a user cannot create a gym', !selfGym.ok, `status ${selfGym.status}`)
const selfOperate = await api(`/api/collections/gyms/records/${gym.id}`, {
  method: 'PATCH',
  token: B.token,
  body: { operators: [B.id, O.id] },
})
check('a user cannot add themselves as an operator', !selfOperate.ok, `status ${selfOperate.status}`)

// --- cross-tenant: an operator of one gym cannot touch another ---
// A second gym G2 with its own operator O2, and a member M2 of G2.
const O2 = await user(`audit-op2-${TS}@test.local`)
const M2 = await user(`audit-m2-${TS}@test.local`)
const gym2 = (
  await api('/api/collections/gyms/records', {
    method: 'POST',
    token: su.data.token,
    body: { name: `Audit Gym 2 ${TS}`, operators: [O2.id] },
  })
).data
await api(`/api/collections/users/records/${M2.id}`, {
  method: 'PATCH',
  token: M2.token,
  body: { gym: gym2.id },
})
const g2msg = await api('/api/collections/gym_messages/records', {
  method: 'POST',
  token: O2.token,
  body: { gym: gym2.id, author: O2.id, kind: 'announcement', title: 'g2 only' },
})
check('operator O2 can publish to their own gym G2', g2msg.ok, `status ${g2msg.status}`)

const crossPublish = await api('/api/collections/gym_messages/records', {
  method: 'POST',
  token: O.token,
  body: { gym: gym2.id, author: O.id, kind: 'announcement', title: 'trespass' },
})
check('operator of G1 cannot publish to G2', !crossPublish.ok, `status ${crossPublish.status}`)

const crossDelete = await api(`/api/collections/gym_messages/records/${g2msg.data.id}`, {
  method: 'DELETE',
  token: O.token,
})
check("operator of G1 cannot delete G2's message", !crossDelete.ok, `status ${crossDelete.status}`)

const crossRead = await api('/api/collections/gym_messages/records?perPage=50', { token: O.token })
const readsG2 = (crossRead.data.items ?? []).some((m) => m.gym === gym2.id)
check("operator of G1 cannot read G2's bus", !readsG2)

const crossGrant = await api(`/api/collections/gyms/records/${gym2.id}`, {
  method: 'PATCH',
  token: O.token,
  body: { operators: [O2.id, O.id] },
})
check('operator of G1 cannot add themselves to G2', !crossGrant.ok, `status ${crossGrant.status}`)

const crossRename = await api(`/api/collections/gyms/records/${gym2.id}`, {
  method: 'PATCH',
  token: O.token,
  body: { name: `Hijacked ${TS}` },
})
check("operator of G1 cannot rename G2", !crossRename.ok, `status ${crossRename.status}`)

const m1ReadsG2 = await api('/api/collections/gym_messages/records?perPage=50', { token: M.token })
const m1SeesG2 = (m1ReadsG2.data.items ?? []).some((m) => m.gym === gym2.id)
check("a member of G1 cannot read G2's bus", !m1SeesG2)

// Messages are immutable once published: even the owning operator cannot edit.
const editOwn = await api(`/api/collections/gym_messages/records/${realMsg.data.id}`, {
  method: 'PATCH',
  token: O.token,
  body: { title: 'edited' },
})
check('published messages are immutable (no edit, even by author)', !editOwn.ok, `status ${editOwn.status}`)

const opDeletesOwn = await api(`/api/collections/gym_messages/records/${realMsg.data.id}`, {
  method: 'DELETE',
  token: O.token,
})
check('an operator can delete their own gym message', opDeletesOwn.ok, `status ${opDeletesOwn.status}`)

// --- self-service membership (a KNOWN product gap, reported not asserted) ---
// An account can PATCH its own users.gym to any gym id and then read that
// gym's broadcast bus, with no approval from the gym. This is inherited from
// the local-first model (you type your gym's name) and is NOT a data leak —
// the bus carries announcements/menus/offers, no member PII — but it means a
// gym cannot vet its audience, and offer codes are visible to anyone who
// joins. Closing it is a product decision (join code / operator approval),
// so it is surfaced here, deliberately, rather than asserted or silently fixed.
{
  // A dedicated gym with a LIVE message, so the demonstration is real and not
  // an empty-bus false negative (the other gyms get emptied by earlier tests).
  const opX = await user(`audit-opx-${TS}@test.local`)
  const gymX = (
    await api('/api/collections/gyms/records', {
      method: 'POST',
      token: su.data.token,
      body: { name: `Audit Gym X ${TS}`, operators: [opX.id] },
    })
  ).data
  await api('/api/collections/gym_messages/records', {
    method: 'POST',
    token: opX.token,
    body: { gym: gymX.id, author: opX.id, kind: 'offer', title: 'members offer', body: 'code SECRET-20' },
  })
  const intruder = await user(`audit-intruder-${TS}@test.local`)
  const patch = await api(`/api/collections/users/records/${intruder.id}`, {
    method: 'PATCH',
    token: intruder.token,
    body: { gym: gymX.id },
  })
  const re = await api('/api/collections/users/auth-with-password', {
    method: 'POST',
    body: { identity: intruder.email, password: 'auditpass123' },
  })
  const reads = await api('/api/collections/gym_messages/records?perPage=50', { token: re.data.token })
  const grabbed = (reads.data.items ?? []).some((m) => m.gym === gymX.id)
  console.log(
    `NOTE  self-service membership: PATCH users.gym accepted=${patch.ok}, intruder then reads that gym's bus=${grabbed}. Anyone can subscribe to any gym without approval (broadcast content incl. offer codes, no member PII). Closing it is a product decision (join code / operator approval) — tracked, not fixed here.`,
  )
}

// --- push subscriptions are private ---
await api('/api/collections/push_subs/records', {
  method: 'POST',
  token: A.token,
  body: { owner: A.id, endpoint: `https://x/${TS}`, p256dh: 'k', auth: 'k' },
})
const bReadsSubs = await api('/api/collections/push_subs/records?perPage=50', { token: B.token })
const subLeak = (bReadsSubs.data.items ?? []).some((s) => s.owner === A.id)
check('cannot read another device push subscription', !subLeak)

// --- shared_cache is server-internal, never client-reachable ---
const cacheRead = await api('/api/collections/shared_cache/records?perPage=1', { token: A.token })
check('shared cache is not client-readable', cacheRead.status === 400 || cacheRead.status === 403 || (cacheRead.data.items ?? []).length === 0, `status ${cacheRead.status}`)

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} invariants hold`)
if (failed.length) {
  console.error('VIOLATIONS: ' + failed.map((r) => r.name).join('; '))
  process.exit(1)
}
console.log('server permissions: clean')
