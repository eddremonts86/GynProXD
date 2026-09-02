/**
 * Proof that "up to five gyms" is a number the server enforces.
 *
 * Enterprise is sold as one account holding several gyms, and the whole shape
 * rests on `users.gym_cap` being checked rather than remembered. A cap nobody
 * checks is a line on a price list: the sixth gym gets provisioned by the same
 * hand as the fifth, at the same money.
 *
 * So this boots a throwaway PocketBase from the repo's own migrations and hooks
 * and asks:
 *
 *   Does an account with no cap set own exactly one gym?
 *   Does raising the cap let it own more, up to the number and not past it?
 *   Does the check count what an account owns rather than what it operates?
 *   Does a superuser get past it? (No. That is the only hand that can create
 *   a gym, so exempting it would exempt the only path there is.)
 *   Does moving a gym's owner respect the new owner's cap?
 *
 *   node scripts/audit/gym-cap-boundary.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { startSandbox } from './pb-sandbox.mjs'

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

const account = async (email) => {
  const made = await api('POST', '/api/collections/users/records',
    { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
  return made.json.id
}

const makeGym = (name, owner) =>
  api('POST', '/api/collections/gyms/records',
    { name, kind: 'gym', plan: 'plus', owner, operators: [owner] }, su)

try {
  const solo = await account('one-room@enforma.test')
  const group = await account('five-rooms@enforma.test')

  console.log('\nwith no cap set')
  check('the first gym is allowed', (await makeGym('Solo Room', solo)).status, 200)
  check('and the second is refused', (await makeGym('Solo Annex', solo)).status, 400)
  const refusal = await makeGym('Solo Third', solo)
  check('in words that say what to do', /gym_cap/.test(refusal.json?.message ?? ''), true)

  console.log('\nwith the cap raised to five')
  await api('PATCH', `/api/collections/users/records/${group}`, { gym_cap: 5 }, su)
  const made = []
  for (let i = 1; i <= 5; i += 1) made.push((await makeGym(`Room ${i}`, group)).status)
  check('five are allowed', made, [200, 200, 200, 200, 200])
  check('the sixth is not', (await makeGym('Room 6', group)).status, 400)

  console.log('\nwhat the cap counts')
  /* Operating is not owning: the house gym and a colleague's roster put an
     account in `operators` without it owning anything. */
  const houses = await api('GET',
    `/api/collections/gyms/records?filter=${encodeURIComponent("kind='house'")}`, undefined, su)
  const house = houses.json.items?.[0]
  if (!house) throw new Error('no house gym: the migrations did not run')
  await api('PATCH', `/api/collections/gyms/records/${house.id}`,
    { operators: [solo] }, su)
  check('operating a gym it does not own changes nothing',
    (await makeGym('Solo Fourth', solo)).status, 400)

  console.log('\nhanding a gym over')
  const spare = await account('spare@enforma.test')
  const theirs = (await makeGym('Spare Room', spare)).json
  check('the new owner is over their own cap',
    (await api('PATCH', `/api/collections/gyms/records/${theirs.id}`, { owner: solo }, su)).status, 400)
  check('and a gym with no owner is nobody problem',
    (await api('POST', '/api/collections/gyms/records',
      { name: 'Ownerless', kind: 'gym', plan: 'base' }, su)).status, 200)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
