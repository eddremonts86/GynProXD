/**
 * Proof that the coach costs a bounded amount.
 *
 * The proxy at /api/minimax/chat/completions is the one route in this product
 * that spends money on somebody else's say-so: signed in, one call, a bill.
 * It metered every call and capped none of them, which is a standing invitation
 * to a loop — deliberate or accidental — that we pay for.
 *
 * So this boots a throwaway PocketBase from the repo's own migrations and hooks
 * and asks:
 *
 *   Is an account under the limit let through?
 *   Is one at the limit refused?
 *   Does another account's spending count against mine?
 *   Can a member read the meter, or write a row into it?
 *
 * The sandbox has no vendor key, so "let through" reads as 503 (no coach on
 * this server) rather than a real answer. That is the point: the cap is checked
 * before the key, so the boundary is provable without spending anything.
 *
 *   node scripts/audit/coach-cap.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { startSandbox } from './pb-sandbox.mjs'

const CALLS_PER_DAY = 20

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

const pb = await startSandbox()
const { su, api } = pb

/** One ask of the coach, as the app makes it. */
const ask = (token) =>
  api('POST', '/api/minimax/chat/completions',
    { model: 'x', messages: [{ role: 'user', content: 'design me something' }] }, token)

/* The meter is written by the proxy with a privileged save and has no create
   rule, so seeding it is a superuser's job — which is also the check that a
   member cannot invent a bill for somebody else. */
const meter = (owner, n) =>
  Promise.all(
    Array.from({ length: n }, () =>
      api('POST', '/api/collections/coach_usage/records',
        { owner, model: 'seed', host: 'seed', input_tokens: 1, output_tokens: 1, ms: 1, status: 200, ok: true }, su),
    ),
  )

try {
  const account = async (email) => {
    await api('POST', '/api/collections/users/records',
      { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
    const auth = await api('POST', '/api/collections/users/auth-with-password',
      { identity: email, password: 'passw0rd123' })
    return { id: auth.json.record.id, token: auth.json.token }
  }

  const mine = await account('spender@enforma.test')
  const other = await account('thrifty@enforma.test')

  console.log('\nthe door')
  check('signed out is refused before anything is spent', (await ask(undefined)).status, 401)
  /* 503 rather than 200: no vendor key here, which is as far as a test should
     ever get down this route. */
  check('a fresh account gets past the cap', (await ask(mine.token)).status, 503)

  console.log('\nthe cap')
  await meter(mine.id, CALLS_PER_DAY - 1)
  check(`${CALLS_PER_DAY - 1} calls today is still under it`, (await ask(mine.token)).status, 503)
  await meter(mine.id, 1)
  check(`the ${CALLS_PER_DAY}th closes it`, (await ask(mine.token)).status, 429)
  const refusal = await ask(mine.token)
  check('and says so in words a person could read',
    /already answered \d+ times/.test(refusal.json?.message ?? ''), true)

  console.log('\nand it is my cap, not the account next to me')
  check('a second account is unaffected', (await ask(other.token)).status, 503)
  await meter(other.id, CALLS_PER_DAY)
  check('until it spends its own', (await ask(other.token)).status, 429)

  console.log('\nthe meter itself')
  const read = await api('GET', '/api/collections/coach_usage/records', undefined, mine.token)
  check('a member cannot read it', (read.json.items ?? []).length, 0)
  const forged = await api('POST', '/api/collections/coach_usage/records',
    { owner: other.id, model: 'forged' }, mine.token)
  check('nor write a row into somebody else', forged.status >= 400, true)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
