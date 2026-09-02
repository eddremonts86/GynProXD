/**
 * Grant (or update) gyms and their operators: the platform-admin act that turns
 * a verified, paying application into a publisher. Superuser only.
 *
 *   PB_SUPERUSER_EMAIL=... PB_SUPERUSER_PASSWORD=... node scripts/admin/grant-gym.mjs \
 *     --server https://enforma-sync.example.com \
 *     --owner desk@example.com \
 *     --gym "Iron House" \
 *     --plan plus \
 *     --operators coach@example.com[,other@example.com]
 *
 * Several rooms under one account, which is what Enterprise is:
 *
 *     --owner group@example.com --plan plus \
 *     --gym "North Room" --gym "South Room" --gym "Riverside"
 *
 * **Enterprise is not a plan value.** `gyms.plan` is `base` or `plus` and says
 * what one room can do; Enterprise is that account holding several of them,
 * which is `users.gym_cap`. The rooms of an Enterprise account are Plus rooms.
 * Setting `--plan enterprise` is refused rather than silently truncated, since
 * the column holds eight characters and "enterprise" is ten.
 *
 * The cap is raised before the rooms are made, because the server refuses the
 * room past it and would leave the job half done otherwise.
 *
 * Idempotent: an existing gym keeps its id, gains any new operators, and has
 * its plan and owner brought into line. Operator and owner emails must already
 * have accounts, because somebody signs up in the app and you grant after
 * verifying, and charging, them.
 */
const argv = process.argv.slice(2)
const args = {}
const many = { gym: [] }
for (let i = 0; i < argv.length; i += 1) {
  if (!argv[i].startsWith('--')) continue
  const key = argv[i].slice(2)
  const value = argv[i + 1]
  if (key === 'gym') many.gym.push(value)
  else args[key] = value
}

const SERVER = (args.server ?? '').replace(/\/+$/, '')
const PLAN = (args.plan ?? 'base').trim()
const OWNER = (args.owner ?? '').trim()
const GYMS = [...many.gym, ...(args.gyms ?? '').split(',')].map((g) => (g ?? '').trim()).filter(Boolean)
const OPERATORS = (args.operators ?? '').split(',').map((e) => e.trim()).filter(Boolean)
const EMAIL = process.env.PB_SUPERUSER_EMAIL ?? process.env.PB_SU_EMAIL
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD ?? process.env.PB_SU_PASSWORD

const usage =
  'usage: PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node grant-gym.mjs ' +
  '--server URL --owner email --gym NAME [--gym NAME…] [--plan base|plus] [--operators a@b.c,…]'

if (!SERVER || GYMS.length === 0 || !OWNER || !EMAIL || !PASSWORD) {
  console.error(usage)
  process.exit(1)
}
if (PLAN !== 'base' && PLAN !== 'plus') {
  console.error(
    PLAN === 'enterprise'
      ? 'Enterprise is not a plan. It is one account owning several rooms: pass --plan plus and\n' +
        'several --gym names, and this raises that account\'s gym_cap to match.'
      : `unknown plan "${PLAN}": expected base or plus`,
  )
  process.exit(1)
}

const call = async (path, options = {}) => {
  const res = await fetch(SERVER + path, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: options.token } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

const accountFor = async (email, token, role) => {
  const list = await call(
    `/api/collections/users/records?filter=${encodeURIComponent(`email = "${email}"`)}`,
    { token },
  )
  const user = list.items[0]
  if (!user) throw new Error(`no account for ${role} ${email} — they sign up in the app first`)
  return user
}

const su = await call('/api/collections/_superusers/auth-with-password', {
  method: 'POST',
  body: { identity: EMAIL, password: PASSWORD },
})
const token = su.token

const owner = await accountFor(OWNER, token, 'owner')
console.log(`owner ${OWNER} -> ${owner.id}`)

const operatorIds = [owner.id]
for (const email of OPERATORS) {
  if (email === OWNER) continue
  const user = await accountFor(email, token, 'operator')
  operatorIds.push(user.id)
  console.log(`operator ${email} -> ${user.id}`)
}

/* Before the rooms, not after: the cap is enforced on the server, so a run that
   made three rooms and then raised the cap would fail on the second one. */
const cap = Math.max(GYMS.length, Number(owner.gym_cap) || 1)
if (cap !== (Number(owner.gym_cap) || 1)) {
  await call(`/api/collections/users/records/${owner.id}`, {
    method: 'PATCH',
    token,
    body: { gym_cap: cap },
  })
  console.log(`gym_cap ${owner.gym_cap ?? 1} -> ${cap} for ${OWNER}`)
}

for (const name of GYMS) {
  const existing = await call(
    `/api/collections/gyms/records?filter=${encodeURIComponent(`name = "${name.replace(/"/g, '')}"`)}`,
    { token },
  )
  const found = existing.items[0]
  if (found) {
    const merged = [...new Set([...(found.operators ?? []), ...operatorIds])]
    await call(`/api/collections/gyms/records/${found.id}`, {
      method: 'PATCH',
      token,
      body: { operators: merged, plan: PLAN, owner: owner.id },
    })
    console.log(`updated "${name}" (${found.id}) — ${PLAN}, ${merged.length} operator(s)`)
  } else {
    const made = await call('/api/collections/gyms/records', {
      method: 'POST',
      token,
      body: { name, kind: 'gym', plan: PLAN, owner: owner.id, operators: operatorIds },
    })
    console.log(`created "${name}" (${made.id}) — ${PLAN}, ${operatorIds.length} operator(s)`)
  }
}

console.log(
  GYMS.length > 1
    ? `done: ${GYMS.length} rooms on one account. The desk offers a switcher; the operators get the gym role on their next sync.`
    : 'done: the operators get the gym role on their next sync, on every device they sign into',
)
