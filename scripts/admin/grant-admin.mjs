/**
 * Grant the app admin role to an existing enForma account. The account must
 * already exist (created through the app's "Create sync account", so it has
 * proper auth material) — this only marks it platform admin, which the app
 * adopts as role='admin' on that account's next sync, on every device.
 *
 *   PB_SU_EMAIL=… PB_SU_PASSWORD=… node scripts/admin/grant-admin.mjs \
 *     --server http://enforma-sync.localhost --account edd@example.com
 *
 * Idempotent. Use --revoke to remove the grant.
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((p, a, i, all) => {
    if (a.startsWith('--')) p.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
    return p
  }, []),
)
const SERVER = (args.server ?? '').replace(/\/+$/, '')
const ACCOUNT = args.account
const REVOKE = args.revoke === true
const EMAIL = process.env.PB_SU_EMAIL
const PASSWORD = process.env.PB_SU_PASSWORD

if (!SERVER || !ACCOUNT || !EMAIL || !PASSWORD) {
  console.error('usage: PB_SU_EMAIL=… PB_SU_PASSWORD=… node grant-admin.mjs --server URL --account email [--revoke]')
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

const users = await call(
  `/api/collections/users/records?filter=${encodeURIComponent(`email = "${ACCOUNT}"`)}`,
  { token },
)
const user = users.items[0]
if (!user) throw new Error(`no enForma account for ${ACCOUNT} — create it in the app first (Create sync account)`)

const existing = await call(
  `/api/collections/platform_admins/records?filter=${encodeURIComponent(`owner = "${user.id}"`)}`,
  { token },
)

if (REVOKE) {
  if (existing.items[0]) await call(`/api/collections/platform_admins/records/${existing.items[0].id}`, { method: 'DELETE', token })
  console.log(`revoked platform admin from ${ACCOUNT}`)
} else if (existing.items[0]) {
  console.log(`${ACCOUNT} is already a platform admin`)
} else {
  await call('/api/collections/platform_admins/records', { method: 'POST', token, body: { owner: user.id } })
  console.log(`granted platform admin to ${ACCOUNT} — it becomes admin in the app on next sync`)
}
