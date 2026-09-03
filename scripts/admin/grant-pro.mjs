/**
 * Give an existing enForma account Pro, by hand, for a number of months.
 *
 * This is how a gym gets its plan today and it is how a member gets Pro until
 * a card can do it: `docs/features/BACKLOG.md` §3 argues that a mechanism with
 * no payments behind it is worse than a person running a script on purpose, and
 * that holds for exactly as long as the number of accounts is small.
 *
 * What it is for beyond that: the entitlement has to be gradable before there
 * is anything to grade. Every screen behind Pro, and the boundary audit that
 * proves the gate holds, needs an account that is Pro without a payment
 * provider being involved.
 *
 *   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/admin/grant-pro.mjs \
 *     --server http://enforma-sync.localhost --account edd@example.com --months 1
 *
 * Extends from whichever is later, today or the date already on the account, so
 * running it twice buys two months rather than losing one. `--revoke` clears
 * the field; `--until 2026-12-31` sets an exact date instead of counting months.
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
const UNTIL = typeof args.until === 'string' ? args.until : null
const MONTHS = Number(args.months ?? 1)
const EMAIL = process.env.PB_SUPERUSER_EMAIL ?? process.env.PB_SU_EMAIL
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD ?? process.env.PB_SU_PASSWORD

if (!SERVER || !ACCOUNT || !EMAIL || !PASSWORD || (!REVOKE && !UNTIL && !(MONTHS > 0))) {
  console.error(
    'usage: PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node grant-pro.mjs' +
      ' --server URL --account email [--months 1 | --until YYYY-MM-DD | --revoke]',
  )
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

if (REVOKE) {
  await call(`/api/collections/users/records/${user.id}`, {
    method: 'PATCH',
    token,
    body: { pro_until: '', pro_source: '' },
  })
  console.log(`revoked Pro from ${ACCOUNT}`)
  process.exit(0)
}

/* The date PocketBase already holds, if it is still ahead of us. Extending from
   `now` instead would quietly shorten a subscription every time somebody
   topped one up early, which is the direction of mistake that costs a customer
   days they paid for. */
const held = Date.parse(String(user.pro_until || '').replace(' ', 'T'))
const from = Number.isFinite(held) && held > Date.now() ? new Date(held) : new Date()

let until
if (UNTIL) {
  const parsed = Date.parse(`${UNTIL}T23:59:59Z`)
  if (!Number.isFinite(parsed)) throw new Error(`--until wants YYYY-MM-DD, got ${UNTIL}`)
  until = new Date(parsed)
} else {
  until = new Date(from)
  /* setUTCMonth clamps rather than rolling over, so 31 January plus one month
     is 28 February and not 3 March. A subscription that lands on the wrong side
     of a month end is a support conversation nobody needs. */
  const day = until.getUTCDate()
  until.setUTCDate(1)
  until.setUTCMonth(until.getUTCMonth() + MONTHS)
  const lastDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 0)).getUTCDate()
  until.setUTCDate(Math.min(day, lastDay))
}

await call(`/api/collections/users/records/${user.id}`, {
  method: 'PATCH',
  token,
  body: { pro_until: until.toISOString().replace('T', ' '), pro_source: 'grant' },
})
console.log(`${ACCOUNT} is Pro until ${until.toISOString().slice(0, 10)} (source: grant)`)
