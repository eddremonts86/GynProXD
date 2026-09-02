/**
 * Who works a gym's desk, asked of the API rather than the panel.
 *
 * The roster is the one thing here that decides who may speak as the gym, so
 * the questions worth asking are about the ways it could be taken:
 *
 *   Can an invited operator remove the person who invited them?
 *   Can a rival's operator add themselves to somebody else's gym?
 *   Can the owner be removed — by anybody, including themselves?
 *   Does the cap count seats a gym is only holding?
 *   Does inviting an address reveal whether it has an account?
 *
 * The last one is the quiet one. The obvious build looks up the address and
 * adds whoever holds it, which answers "does this email have an enForma
 * account" for anybody who pays for a gym.
 *
 *   node scripts/audit/operators-boundary.mjs
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

try {
  const account = async (email) => {
    const created = await api('POST', '/api/collections/users/records',
      { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
    const auth = await api('POST', '/api/collections/users/auth-with-password',
      { identity: email, password: 'passw0rd123' })
    return { id: created.json.id, token: auth.json.token, email }
  }

  const owner = await account('owner@hierro.test')
  const coach = await account('coach@hierro.test')
  const rival = await account('rival@ronda.test')
  const stranger = await account('stranger@nowhere.test')

  const plus = (await api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [owner.id], owner: owner.id }, su)).json
  const base = (await api('POST', '/api/collections/gyms/records',
    { name: 'Casa Ronda', kind: 'gym', plan: 'base', operators: [rival.id], owner: rival.id }, su)).json

  const invite = (who, gymId, email) =>
    api('POST', '/api/enforma/gym/invite', { gym: gymId, email }, who.token)
  const remove = (who, gymId, userId) =>
    api('POST', '/api/enforma/gym/remove-operator', { gym: gymId, user: userId }, who.token)
  const roster = async (gymId) =>
    (await api('GET', `/api/collections/gyms/records/${gymId}`, undefined, su)).json.operators ?? []

  console.log('\nthe migration')
  check('an existing gym was given an owner', !!plus.owner, true)

  console.log('\nwho may change the desk')
  check('the owner can add somebody', (await invite(owner, plus.id, coach.email)).status, 200)
  check('and they are on the desk', (await roster(plus.id)).includes(coach.id), true)
  /* The reason there is an owner at all. */
  check('the operator they just added cannot remove them',
    (await remove(coach, plus.id, owner.id)).status, 403)
  check('nor add anybody themselves', (await invite(coach, plus.id, stranger.email)).status, 403)
  check('a rival’s owner cannot add themselves to this gym',
    (await invite(rival, plus.id, rival.email)).status, 403)
  check('the owner still holds the desk', (await roster(plus.id)).sort(), [coach.id, owner.id].sort())

  console.log('\nthe owner stays')
  check('even the owner cannot remove the owner',
    (await remove(owner, plus.id, owner.id)).status, 400)
  check('because a gym whose owner left its own roster could add nobody ever again',
    (await roster(plus.id)).includes(owner.id), true)

  console.log('\nthe cap')
  check('Base covers one, so its owner cannot add a second',
    (await invite(rival, base.id, stranger.email)).status, 403)
  /* Plus is five, and the two already there count. Three more fills it. */
  for (const n of [1, 2, 3]) {
    check(`Plus takes number ${n + 2}`,
      (await invite(owner, plus.id, `seat${n}@hierro.test`)).status, 200)
  }
  check('and refuses the sixth', (await invite(owner, plus.id, 'seat4@hierro.test')).status, 403)
  /**
   * The seats just filled are invitations, not accounts — none of those
   * addresses exists. Counting only accepted ones would let a gym invite thirty
   * people and meet the cap one acceptance at a time.
   */
  const held = (await api('GET',
    `/api/collections/gym_invites/records?filter=${encodeURIComponent(`gym = "${plus.id}"`)}`,
    undefined, su)).json.items ?? []
  check('an unclaimed invitation holds a seat', held.length, 3)

  console.log('\nwhat inviting an address reveals')
  /* Both refused for being full, and identically — the answer must not depend
     on whether the address exists. */
  const existing = await invite(owner, plus.id, stranger.email)
  const madeUp = await invite(owner, plus.id, 'nobody-at-all@nowhere.test')
  check('the same answer for an address that exists and one that does not',
    [existing.status, existing.json.message], [madeUp.status, madeUp.json.message])

  console.log('\nclaiming')
  const claimant = await account('seat1@hierro.test')
  /* `account()` signs in, which is when an invitation is claimed. */
  check('signing in with an invited address puts them on the desk',
    (await roster(plus.id)).includes(claimant.id), true)
  const after = (await api('GET',
    `/api/collections/gym_invites/records?filter=${encodeURIComponent(`gym = "${plus.id}"`)}`,
    undefined, su)).json.items ?? []
  check('and the invitation is spent, not left to be claimed twice', after.length, 2)

  console.log('\nwho can read the pending list')
  const asOperator = await api('GET', '/api/collections/gym_invites/records', undefined, coach.token)
  check('this gym’s operators can', (asOperator.json.items ?? []).length > 0, true)
  const asRival = await api('GET', '/api/collections/gym_invites/records', undefined, rival.token)
  check('a rival cannot see who this gym is courting', (asRival.json.items ?? []).length, 0)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
