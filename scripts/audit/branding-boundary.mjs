/**
 * A gym's colour: who may set it, and what it can reach.
 *
 * The colour itself is not a secret — it is on their door — so the questions
 * here are about who may change it and what it must never repaint:
 *
 *   Can an operator who is not the owner set it?
 *   Can a gym on Base set one at all?
 *   Is a colour the app cannot parse refused rather than stored?
 *   Can a rival set somebody else's colour?
 *   Can a member read it, which is how their app learns it?
 *
 *   node scripts/audit/branding-boundary.mjs
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
    return { id: created.json.id, token: auth.json.token }
  }

  const owner = await account('owner@hierro.test')
  const coach = await account('coach@hierro.test')
  const rival = await account('rival@ronda.test')
  const member = await account('member@hierro.test')

  const plus = (await api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus',
      operators: [owner.id, coach.id], owner: owner.id }, su)).json
  const base = (await api('POST', '/api/collections/gyms/records',
    { name: 'Casa Ronda', kind: 'gym', plan: 'base', operators: [rival.id], owner: rival.id }, su)).json

  await api('POST', '/api/collections/gym_secrets/records', { gym: plus.id, code: 'HIERRO-1' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: plus.id, code: 'HIERRO-1' }, member.token)

  const setBrand = (who, gymId, color) =>
    api('POST', '/api/enforma/gym/set-brand', { gym: gymId, color }, who.token)
  const colorOf = async (gymId) =>
    (await api('GET', `/api/collections/gyms/records/${gymId}`, undefined, su)).json.brand_color

  console.log('\nwho may set it')
  check('the owner can', (await setBrand(owner, plus.id, '#1e3a5f')).status, 200)
  check('and it is stored normalised', await colorOf(plus.id), '#1e3a5f')
  /* The same hand that decides the roster: a colour is the gym's face, and an
     operator repainting it without the owner is the same class of act. */
  check('an operator who is not the owner cannot', (await setBrand(coach, plus.id, '#ff0000')).status, 403)
  check('a rival cannot paint somebody else’s gym', (await setBrand(rival, plus.id, '#ff0000')).status, 403)
  check('and none of them changed it', await colorOf(plus.id), '#1e3a5f')

  console.log('\nwhat may be set')
  check('short form is expanded, not stored as typed',
    [(await setBrand(owner, plus.id, 'F00')).status, await colorOf(plus.id)], [200, '#ff0000'])
  /* A colour the app cannot parse renders as nothing, which looks exactly like
     the feature being broken — so it is refused rather than stored. */
  for (const bad of ['red', '#12345', 'rgb(1,2,3)', '#gggggg']) {
    check(`"${bad}" is refused`, (await setBrand(owner, plus.id, bad)).status, 400)
  }
  check('and the last good colour survived every refusal', await colorOf(plus.id), '#ff0000')
  check('empty clears it, which is how a gym goes back to ours',
    [(await setBrand(owner, plus.id, '')).status, await colorOf(plus.id)], [200, ''])

  console.log('\nthe plan')
  check('a Base gym cannot set one', (await setBrand(rival, base.id, '#1e3a5f')).status, 403)
  check('and has none', await colorOf(base.id), '')

  console.log('\nwho may read it')
  await setBrand(owner, plus.id, '#1e3a5f')
  const asMember = await api('GET', `/api/collections/gyms/records/${plus.id}`, undefined, member.token)
  /* How a member's app learns it at all. The colour is the least private thing
     a gym has; the gym row was already readable. */
  check('their own member can', asMember.json.brand_color, '#1e3a5f')
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
