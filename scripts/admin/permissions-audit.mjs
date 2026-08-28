/**
 * Cross-user permissions audit. Creates throwaway accounts, then tries every
 * forbidden move one user could make against another — and the few allowed
 * ones as positive controls. Exits non-zero if any hole is found.
 *
 *   PB_SU_EMAIL=… PB_SU_PASSWORD=… node scripts/admin/permissions-audit.mjs \
 *     --server http://enforma-sync.localhost [--keep]
 *
 * Throwaway users are deleted at the end (cascades their rows) unless --keep.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1] ?? true])
    return pairs
  }, []),
)
const SERVER = (args.server ?? '').replace(/\/+$/, '')
const SU_EMAIL = process.env.PB_SU_EMAIL
const SU_PASSWORD = process.env.PB_SU_PASSWORD
if (!SERVER || !SU_EMAIL || !SU_PASSWORD) {
  console.error('usage: PB_SU_EMAIL=… PB_SU_PASSWORD=… node permissions-audit.mjs --server URL [--keep]')
  process.exit(1)
}

const TS = Date.now()
let failures = 0
const j = (r) => r.json()

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(SERVER + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: token } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  return { status: res.status, data: await res.json().catch(() => ({})) }
}
function expectDeny(label, res, extra = '') {
  const denied = [400, 401, 403, 404].includes(res.status)
  console.log(`${denied ? 'PASS' : 'FAIL'}  deny: ${label}${denied ? '' : ` -> ${res.status} ${JSON.stringify(res.data).slice(0, 100)}`} ${extra}`)
  if (!denied) failures += 1
}
function expectAllow(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  allow: ${label} ${extra}`)
  if (!ok) failures += 1
}
async function user(email) {
  await api('/api/collections/users/records', { method: 'POST', body: { email, password: 'audit-pass-123', passwordConfirm: 'audit-pass-123' } })
  const auth = (await api('/api/collections/users/auth-with-password', { method: 'POST', body: { identity: email, password: 'audit-pass-123' } })).data
  return { id: auth.record.id, token: auth.token, email }
}

const su = (await api('/api/collections/_superusers/auth-with-password', { method: 'POST', body: { identity: SU_EMAIL, password: SU_PASSWORD } })).data
if (!su.token) { console.error('superuser auth failed'); process.exit(1) }

// Fixtures: A and B are strangers; O operates gym G; M is a member of G.
const A = await user(`audit-a-${TS}@test.local`)
const B = await user(`audit-b-${TS}@test.local`)
const O = await user(`audit-op-${TS}@test.local`)
const M = await user(`audit-m-${TS}@test.local`)
const gym = (await api('/api/collections/gyms/records', { method: 'POST', token: su.token, body: { name: `Audit Gym ${TS}`, operators: [O.id] } })).data
await api(`/api/collections/users/records/${M.id}`, { method: 'PATCH', token: M.token, body: { gym: gym.id } })
const bRecord = (await api('/api/collections/records/records', { method: 'POST', token: B.token, body: { owner: B.id, col: 'workouts', rid: `w