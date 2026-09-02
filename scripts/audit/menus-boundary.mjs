/**
 * Proof that a gym's kitchen card is only its own to read and to write.
 *
 * `gym_menus` is the one collection whose write rules read as wide open —
 * create and update are "signed in", full stop — because the real check
 * cannot be written as a rule: "you operate this gym" means following the
 * draft's relation, which a rule cannot do. A hook does it instead.
 *
 * That arrangement is correct and it is also the most fragile kind: a hook
 * file that fails to load, or an `onRecordCreateRequest` filter typed with the
 * wrong collection name, leaves a collection anybody signed in can write, with
 * no rule behind it to catch the fall. The screens walk drives the menu editor
 * from the operator's own browser, which proves the feature and would not
 * notice any of that.
 *
 * So this boots a throwaway PocketBase from the repo's own migrations and hooks
 * and asks, from a rival's account rather than from the UI:
 *
 *   Can a rival operator write a card into my gym?
 *   Can they edit or delete the one I wrote?
 *   Can they read what my members are being charged?
 *   Can somebody with no gym at all read it?
 *   Can my own member read it, and only read it?
 *
 *   node scripts/audit/menus-boundary.mjs
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

const CARD = { sections: [{ title: 'Post-training', items: [{ name: 'Rice bowl', price: '65 kr' }] }] }

try {
  const account = async (email) => {
    await api('POST', '/api/collections/users/records',
      { email, password: 'passw0rd123', passwordConfirm: 'passw0rd123' }, su)
    const auth = await api('POST', '/api/collections/users/auth-with-password',
      { identity: email, password: 'passw0rd123' })
    return { id: auth.json.record.id, token: auth.json.token }
  }

  /* Two gyms with a real rival in each other's place, so "a rival" is an
     account that exists rather than a hypothetical. */
  const mine = (await api('POST', '/api/collections/gyms/records',
    { name: 'Cocina Hierro', kind: 'gym', plan: 'plus' }, su)).json
  const theirs = (await api('POST', '/api/collections/gyms/records',
    { name: 'Casa Ronda', kind: 'gym', plan: 'plus' }, su)).json

  const desk = await account('desk@cocina.test')
  const rival = await account('desk@ronda.test')
  const member = await account('member@cocina.test')
  const loner = await account('loner@enforma.test')

  await api('PATCH', `/api/collections/gyms/records/${mine.id}`, { operators: [desk.id] }, su)
  await api('PATCH', `/api/collections/gyms/records/${theirs.id}`, { operators: [rival.id] }, su)

  /* Joined by code, the way a member actually joins: `users.gym` is guarded
     against direct writes, so seeding it by PATCH would test a path the app
     does not have. */
  await api('POST', '/api/collections/gym_secrets/records', { gym: mine.id, code: 'HIERRO-9' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: mine.id, code: 'HIERRO-9' }, member.token)

  console.log('\nwriting')
  const own = await api('POST', '/api/collections/gym_menus/records',
    { gym: mine.id, ...CARD }, desk.token)
  check('the gym writes its own card', own.status, 200)
  const intruder = await api('POST', '/api/collections/gym_menus/records',
    { gym: mine.id, sections: [{ title: 'Free beer', items: [] }] }, rival.token)
  check('a rival operator cannot write into it', intruder.status, 403)
  const byMember = await api('POST', '/api/collections/gym_menus/records',
    { gym: mine.id, sections: [] }, member.token)
  check('nor can its own member', byMember.status, 403)
  const ghost = await api('POST', '/api/collections/gym_menus/records',
    { gym: 'nosuchgymid00000', sections: [] }, rival.token)
  check('nor invent a gym to hang one on', ghost.status >= 400, true)

  console.log('\nediting what is already there')
  const row = own.json.id
  check('the gym edits its own',
    (await api('PATCH', `/api/collections/gym_menus/records/${row}`,
      { sections: [{ title: 'Winter card', items: [] }] }, desk.token)).status, 200)
  const tamper = await api('PATCH', `/api/collections/gym_menus/records/${row}`,
    { sections: [{ title: 'Half price', items: [] }] }, rival.token)
  check('a rival cannot reprice it', tamper.status >= 400, true)
  check('nor delete it',
    (await api('DELETE', `/api/collections/gym_menus/records/${row}`, undefined, rival.token)).status >= 400, true)
  /* Read it back rather than trusting the refusal: a 403 that wrote anyway is
     the failure this walk exists for. */
  const after = await api('GET', `/api/collections/gym_menus/records/${row}`, undefined, desk.token)
  check('and the card still says what the gym said', after.json.sections?.[0]?.title, 'Winter card')

  console.log('\nreading')
  const seen = (token) =>
    api('GET', '/api/collections/gym_menus/records?perPage=50', undefined, token)
      .then((r) => (r.json.items ?? []).map((m) => m.gym))
  check('the gym sees its own', await seen(desk.token), [mine.id])
  check('its member sees it', await seen(member.token), [mine.id])
  check('the rival gym sees nothing', await seen(rival.token), [])
  check('somebody with no gym sees nothing', await seen(loner.token), [])
  check('and a direct fetch by id is refused too',
    (await api('GET', `/api/collections/gym_menus/records/${row}`, undefined, rival.token)).status, 404)
  /* A list rule is a filter, not a gate: a guest is answered 200 with nothing
     in it. Empty is the property worth asserting — the status code would pass
     just as happily if every card were in the payload. */
  const guest = await api('GET', '/api/collections/gym_menus/records')
  check('signed out is answered, and answered nothing', (guest.json.items ?? []).length, 0)
  check('and cannot fetch one by id',
    (await api('GET', `/api/collections/gym_menus/records/${row}`)).status, 404)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
