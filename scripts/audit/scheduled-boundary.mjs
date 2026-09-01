/**
 * Proof that a scheduled message is not merely hidden by the app.
 *
 * The whole feature rests on one claim: a gym can write Monday's menu on Sunday
 * and nobody reads it on Sunday. A field called `publish_at` does not make that
 * true by itself — the row exists from the moment it is written, and the
 * question is whether the API will hand it over. So this asks the API directly,
 * as each kind of account, against a real PocketBase built from this repo's own
 * migrations and hooks.
 *
 *   Can a member fetch a message whose time has not come?
 *   Can they fetch it one second after it has?
 *   Can the gym that wrote it still see its own queue?
 *   Can a gym on Base schedule at all?
 *   Are a date in the past and a date in the next century both refused?
 *
 *   node scripts/audit/scheduled-boundary.mjs
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

/** PocketBase's own date format, which its rules compare as strings. */
const stamp = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 23) + 'Z'

const pb = await startSandbox()
const { su, api } = pb

try {
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

  const plusDesk = await account('plus-desk@enforma.test')
  const baseDesk = await account('base-desk@enforma.test')
  const member = await account('member@enforma.test')

  await api('PATCH', `/api/collections/gyms/records/${plus.id}`, { operators: [plusDesk.id] }, su)
  await api('PATCH', `/api/collections/gyms/records/${base.id}`, { operators: [baseDesk.id] }, su)
  await api('POST', '/api/collections/gym_secrets/records', { gym: plus.id, code: 'HIERRO-1' }, su)
  await api('POST', '/api/enforma/join-with-code', { gym: plus.id, code: 'HIERRO-1' }, member.token)

  const publish = (who, gymId, title, publishAt) =>
    api('POST', '/api/collections/gym_messages/records',
      { gym: gymId, author: who.id, kind: 'announcement', title, scope: 'members',
        ...(publishAt === undefined ? {} : { publish_at: publishAt }) }, who.token)

  const now = Date.now()

  console.log('\nwhat may be scheduled')
  check('a Plus gym can queue one', (await publish(plusDesk, plus.id, 'Monday menu', stamp(now + 60_000))).status, 200)
  check('a Base gym cannot',
    (await publish(baseDesk, base.id, 'Base tries it', stamp(now + 60_000))).status, 400)
  check('a Base gym publishes now exactly as before',
    (await publish(baseDesk, base.id, 'Base news')).status, 200)
  check('a time that has already passed is refused',
    (await publish(plusDesk, plus.id, 'Yesterday', stamp(now - 3600_000))).status, 400)
  check('and so is one in the next century',
    (await publish(plusDesk, plus.id, 'Someday', stamp(now + 400 * 24 * 3600_000))).status, 400)
  check('a clock a minute behind is forgiven, because phones are',
    (await publish(plusDesk, plus.id, 'Just now', stamp(now - 60_000))).status, 200)
  check('rubbish in the field is refused',
    (await publish(plusDesk, plus.id, 'Nonsense', 'next tuesday-ish')).status, 400)

  console.log('\nwho can read one before its time')
  const titles = async (token) => {
    const list = await api('GET', '/api/collections/gym_messages/records?perPage=50', undefined, token)
    return (list.json.items ?? []).map((m) => m.title).sort()
  }
  /* The claim the feature is sold on, asked of the API rather than the app. */
  check('the gym’s member cannot see Monday’s menu on Sunday',
    (await titles(member.token)).includes('Monday menu'), false)
  check('but does see what was published now', await titles(member.token), ['Just now'])
  /* Not a leak by another door: a filter cannot conjure it either. */
  const probed = await api(
    'GET', `/api/collections/gym_messages/records?filter=${encodeURIComponent('title = "Monday menu"')}`,
    undefined, member.token,
  )
  check('nor find it by asking for it directly', probed.json.items?.length ?? 0, 0)
  check('the gym sees its own queue, or it could never cancel one',
    (await titles(plusDesk.token)).includes('Monday menu'), true)

  console.log('\nwhen its time comes')
  /* Two seconds out, then waited past — the same row, no cron, nothing moved. */
  const soon = await publish(plusDesk, plus.id, 'Two seconds out', stamp(Date.now() + 2000))
  check('queued', soon.status, 200)
  check('and unreadable while it waits',
    (await titles(member.token)).includes('Two seconds out'), false)
  await new Promise((r) => setTimeout(r, 3500))
  check('readable once the clock passes it, with nothing having moved it',
    (await titles(member.token)).includes('Two seconds out'), true)

  console.log('\nthe doorbell')
  /**
   * The push service's own two queries, run against the same rows.
   *
   * It rings on `updated`, which for a message written Sunday and published
   * Monday is Sunday — so before this it would have woken every member on
   * Sunday evening about something none of them could open. The immediate
   * messages still ride that cursor; the queued ones ride a second one over
   * `publish_at`. Asked here rather than trusted, because the queries are the
   * part that was wrong.
   */
  const long_ago = stamp(now - 86_400_000)
  const immediate = await api('GET',
    `/api/collections/gym_messages/records?perPage=100&filter=${encodeURIComponent(
      `updated > "${long_ago}" && publish_at = ""`)}`, undefined, su)
  const rungNow = (immediate.json.items ?? []).map((m) => m.title).sort()
  /* Only the ones with no time on them at all. A message given an explicit
     time is a scheduled message even when that time is a minute ago, and it
     rings on the other cursor — which is what keeps the two paths from both
     claiming the same row and ringing twice. */
  check('the doorbell rings on arrival only for what carries no time',
    rungNow, ['Base news'])
  check('and for nothing that is waiting', rungNow.includes('Monday menu'), false)

  const dueNow = await api('GET',
    `/api/collections/gym_messages/records?perPage=100&sort=publish_at&filter=${encodeURIComponent(
      `publish_at != "" && publish_at > "${long_ago}" && publish_at <= "${stamp(Date.now())}"`)}`,
    undefined, su)
  const rungLater = (dueNow.json.items ?? []).map((m) => m.title).sort()
  check('the second cursor picks up what has just come due',
    rungLater, ['Just now', 'Two seconds out'])
  check('and still leaves Monday’s menu alone', rungLater.includes('Monday menu'), false)
  /* Neither path may claim a row the other one did, or a member is told twice
     about the same message. */
  check('no message is on both paths', rungNow.filter((t) => rungLater.includes(t)), [])

  console.log('\ncancelling')
  const queued = (await api('GET',
    `/api/collections/gym_messages/records?filter=${encodeURIComponent('title = "Monday menu"')}`,
    undefined, plusDesk.token)).json.items?.[0]
  check('a gym can delete what it queued',
    (await api('DELETE', `/api/collections/gym_messages/records/${queued.id}`, undefined, plusDesk.token)).status, 204)
  check('and it is gone', (await titles(plusDesk.token)).includes('Monday menu'), false)
} finally {
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
