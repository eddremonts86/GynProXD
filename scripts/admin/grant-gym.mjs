/**
 * Grant (or update) a gym and its operators — the platform-admin act that
 * turns verified, paying gyms into publishers. Run by the superuser only.
 *
 *   PB_SU_EMAIL=... PB_SU_PASSWORD=... node scripts/admin/grant-gym.mjs \
 *     --server https://enforma-sync.example.com \
 *     --gym "Iron House" \
 *     --operators coach@example.com[,other@example.com]
 *
 * Idempotent: an existing gym gets its operator list extended, never
 * duplicated. Operator emails must already have accounts (the operator signs
 * up in the app first; you grant after verifying — and charging — them).
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]])
    return pairs
  }, []),
)
const SERVER = (args.server ?? '').replace(/\/+$/, '')
const GYM = args.gym
const OPERATORS = (args.operators ?? '').split(',').map((e) => e.trim()).filter(Boolean)
const EMAIL = process.env.PB_SU_EMAIL
const PASSWORD = process.env.PB_SU_PASSWORD

if (!SERVER || !GYM || OPERATORS.length === 0 || !EMAIL || !PASSWORD) {
  console.error('usage: PB_SU_EMAIL=… PB_SU_PASSWORD=… node grant-gym.mjs --server URL --gym NAME --operators a@b.c[,d@e.f]')
  process.exit(1)
}

const call = async (path, options = {}) => {
  const res = await fetch(SERVER + path, {
    method: options.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(options.token ? { authorization: options.token } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

const su = await call('/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: { identity: EMAIL, password: PASSWORD },
})
const token = su.token

const operatorIds = []
for (const email of OPERATORS) {
  const list = await call(
    `/api/collections/users/records?filter=${encodeURIComponent(`email = "${email}"`)}`,
    { token },
  )
  const user = list.items[0]
  if (!user) throw new Error(`no account for operator ${email} — they must sign up in the app first`)
  operatorIds.push(user.id)
  console.log(`operator ${email} -> ${user.id}`)
}

const existing = await call(
  `/api/collections/gyms/records?filter=${encodeURIComponent(`name = "${GYM}"`)}`,
  { token },
)
if (existing.items[0]) {
  const gym = existing.items[0]
  const merged = [...new Set([...(gym.operators ?? []), ...operatorIds])]
  await call(`/api/collections/gyms/records/${gym.id}`, {
    method: 'PATCH',
    token,
    body: { operators: merged },
  })
  console.log(`updated gym "${GYM}" (${gym.id}) — ${merged.length} operator(s)`)
} else {
  const gym = await call('/api/collections/gyms/records', {
    method: 'POST',
    token,
    body: { name: GYM, operators: operatorIds },
  })
  console.log(`created gym "${GYM}" (${gym.id}) — ${operatorIds.length} operator(s)`)
}
console.log('done: the operators get the gym role on their next sync, on every device they sign into')
