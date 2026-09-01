/**
 * Proof that the open door only opens one way.
 *
 * This is the first message in enForma that travels outside a relationship
 * somebody chose: a gym paying for Plus can put an offer in front of people who
 * never asked to hear from it. Everything that makes that acceptable is a rule,
 * and a rule that is not checked from the receiving side is a hope.
 *
 * So this boots a throwaway PocketBase from the repo's own migrations and hooks
 * and asks, from each account in turn:
 *
 *   Can a gym on the cheaper plan use it at all?
 *   Can a gym use it twice in a month?
 *   Does it reach somebody who already pays a rival?
 *   Does it reach somebody who switched it off?
 *   Does it reach a rival's operator, whose own `users.gym` is empty?
 *   Whose name is above it?
 *   Can a gym learn who is in the audience?
 *
 * The last one is the one worth the most to a gym and the one we are least
 * entitled to answer, so it is asked here rather than trusted to the UI.
 *
 *   node scripts/audit/open-door-boundary.mjs
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
  const houses = await api(
    'GET', `/api/collections/gyms/records?filter=${encodeURIComponent("kind='house'")}`, undefined, su,
  )
  const house = houses.json.items?.[0]
  if (!house) throw new Error('no house gym: the migrations did not run')

  /* Two gyms, so "does it reach a rival's members" is a question with a real
     rival in it rather than a hypothetical one. */
  const plus = (await api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus' }, su)).json
  const base = (await api('POST', '/api/collections/gyms/records',
    { name: 'Casa Ronda', kind: 'gym', plan: 'base' }, su)).json

  const account = async (email) => {
    const created = await api('POST', '/api/collections/users/records',
      { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
    const auth = await api('POST', '/api/collections/users/auth-with-password',
      { identity: email, password: 'passw0rd123' })
    return { id: created.json.id, token: auth.json.token }
  }

  const loner = await account('loner@enforma.test')
  const refuser = await account('refuser@enforma.test')
  const rivalMember = await account('rival-member@enforma.test')
  const ownMember = await account('own-member@enforma.test')
  const plusDesk = await account('plus-desk@enforma.test')
  const baseDesk = await account('base-desk@enforma.test')

  await api('PATCH', `/api/collections/gyms/records/${plus.id}`, { operators: [plusDesk.id] }, su)
  await api('PATCH', `/api/collections/gyms/records/${base.id}`, { operators: [baseDesk.id] }, su)

  /* Joined through the code, the way a member actually joins: a direct write to
     users.gym is refused by the membership hook, which is the point of it. */
  await api('POST', '/api/collections/gym_secrets/records', { gym: base.id, code: 'RONDA-1' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: base.id, code: 'RONDA-1' }, rivalMember.token)
  await api('POST', '/api/collections/gym_secrets/records', { gym: plus.id, code: 'HIERRO-1' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: plus.id, code: 'HIERRO-1' }, ownMember.token)

  console.log('\nthe migration')
  /* Asked of an account created AFTER the migration, which is the case the
     first version got wrong: it backfilled `open_to_gyms = true` and every
     later signup arrived false. */
  const fresh = await api('GET', `/api/collections/users/records/${loner.id}`, undefined, su)
  check('an account created after the migration is open to gyms', fresh.json.closed_to_gyms, false)
  /* Said no, the way the switch in Settings says it. */
  await api('PATCH', `/api/collections/users/records/${refuser.id}`, { closed_to_gyms: true }, su)

  const publish = (who, gymId, scope, title) =>
    api('POST', '/api/collections/gym_messages/records',
      { gym: gymId, author: who.id, kind: 'offer', title, scope }, who.token)

  console.log('\nwho may open the door')
  check('a gym on Base cannot, whatever its composer shows',
    (await publish(baseDesk, base.id, 'open-door', 'Base tries it')).status, 403)
  check('a gym on Plus can, once',
    (await publish(plusDesk, plus.id, 'open-door', 'First month on us')).status, 200)
  check('and not twice in the same month',
    (await publish(plusDesk, plus.id, 'open-door', 'Second helping')).status, 403)
  check('its ordinary messages are unaffected',
    (await publish(plusDesk, plus.id, 'members', 'Gym news')).status, 200)
  check('a member cannot publish one on their gym’s behalf',
    (await publish(ownMember, plus.id, 'open-door', 'Not an operator')).status, 403)
  check('nor can a rival’s operator publish from somebody else’s row',
    (await publish(baseDesk, plus.id, 'open-door', 'Rogue')).status, 403)

  const inbox = async (token) => {
    const list = await api('GET', '/api/collections/gym_messages/records?perPage=50', undefined, token)
    return (list.json.items ?? []).map((m) => m.title).sort()
  }

  console.log('\nwho actually receives it')
  check('somebody with no gym does', await inbox(loner.token), ['First month on us'])
  check('somebody who switched it off does not', await inbox(refuser.token), [])
  /* The reason the whole scope split exists. */
  check('a rival’s member never sees it', await inbox(rivalMember.token), [])
  check('the gym’s own members get their gym’s news and not the recruiting',
    await inbox(ownMember.token), ['First month on us', 'Gym news'])
  /* An operator's own `users.gym` is empty, so without the extra clause in the
     read rule every gym on the platform would receive its rivals' recruiting. */
  check('a rival’s operator does not, despite having no gym of their own',
    await inbox(baseDesk.token), [])

  console.log('\nwhat a gym can learn about the audience')
  const peek = await api('GET', '/api/collections/users/records?perPage=50', undefined, plusDesk.token)
  /* Seeing your own row is not a leak and is needed to sign in; seeing anybody
     else's is the whole question. */
  check('it sees its own account and no other',
    (peek.json.items ?? []).map((u) => u.id), [plusDesk.id])
  const filtered = await api(
    'GET', `/api/collections/users/records?filter=${encodeURIComponent('closed_to_gyms=false')}`,
    undefined, plusDesk.token,
  )
  check('and cannot ask the server who is reachable',
    (filtered.json.items ?? []).filter((u) => u.id !== plusDesk.id).length, 0)

  console.log('\nwhose name is on it')
  const seen = await api('GET', '/api/collections/gym_messages/records?perPage=50', undefined, loner.token)
  const row = (seen.json.items ?? [])[0]
  check('the row names the gym that sent it, not the house', row?.gym, plus.id)
  check('and it is not the house row', row?.gym === house.id, false)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
