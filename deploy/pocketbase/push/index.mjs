import { readFile, writeFile, mkdir } from 'node:fs/promises'
import webpush from 'web-push'

/**
 * Phase 6: the doorbell. Polls the gym bus for messages the training sync
 * has already made multi-device and delivers them as Web Push to every
 * subscribed device of the gym's members — the part that reaches people
 * while the app is closed. Subscriptions the gateway reports dead (404/410)
 * are deleted so the store never rots.
 *
 * Poll-based on purpose: the data volume is a gym's announcements, not a
 * firehose, and a 10-second loop is simpler to keep alive than a realtime
 * subscription. State is two cursors in a file.
 *
 * Two, because a scheduled message becomes news at a moment when nothing about
 * its row changes. The doorbell used to ring on `updated`, which for a message
 * written on Sunday and published on Monday is Sunday — so a gym scheduling
 * Monday's menu would have woken every member on Sunday evening to announce
 * something none of them could open. The immediate messages still ride the
 * `updated` cursor, exactly as before; the queued ones ride a second cursor
 * over `publish_at`, and are told about when their time arrives.
 */

const PB = (process.env.PB_URL ?? 'http://pocketbase:8090').replace(/\/+$/, '')
const EMAIL = process.env.PB_SUPERUSER_EMAIL
const PASSWORD = process.env.PB_SUPERUSER_PASSWORD
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:sync@enforma.local'
const POLL_MS = Number(process.env.POLL_MS ?? 10_000)
const STATE_FILE = process.env.STATE_FILE ?? '/state/cursor'

if (!EMAIL || !PASSWORD || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('push: missing PB_SUPERUSER_EMAIL/PASSWORD or VAPID keys; refusing to start')
  process.exit(1)
}
webpush.setVapidDetails(SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)

let token = ''

async function api(path, options = {}) {
  const res = await fetch(PB + path, {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: token } : {}),
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  })
  if (res.status === 401 || res.status === 403) {
    token = ''
    throw new Error('unauthorized')
  }
  if (!res.ok && res.status !== 404) throw new Error(`${path} -> ${res.status}`)
  return res.status === 404 ? null : res.json()
}

async function login() {
  const res = await fetch(PB + '/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) throw new Error(`superuser login -> ${res.status}`)
  token = (await res.json()).token
}

/**
 * Both cursors, from one file.
 *
 * The file held a single line before this, so a deploy that lands mid-life
 * reads that line as the `updated` cursor and starts the `publish_at` one at
 * now — which is right: anything already due was already announced under the
 * old scheme, and starting the new cursor in the past would replay it.
 */
async function readCursors() {
  try {
    const raw = (await readFile(STATE_FILE, 'utf8')).trim()
    const [updated, due] = raw.split('\n')
    return { updated: updated.trim(), due: (due ?? '').trim() || nowStamp() }
  } catch {
    /* First boot: start from now so a fresh deploy does not replay history. */
    const now = nowStamp()
    await writeCursors({ updated: now, due: now })
    return { updated: now, due: now }
  }
}

function nowStamp() {
  return new Date().toISOString().replace('T', ' ')
}

async function writeCursors({ updated, due }) {
  await mkdir(STATE_FILE.split('/').slice(0, -1).join('/') || '/', { recursive: true })
  await writeFile(STATE_FILE, `${updated}\n${due}`)
}

async function subsFor(userIds) {
  const subs = []
  for (const id of userIds) {
    const list = await api(
      `/api/collections/push_subs/records?perPage=200&filter=${encodeURIComponent(`owner = "${id}"`)}`,
    )
    subs.push(...(list?.items ?? []))
  }
  return subs
}

async function deliver(message, gymName) {
  const members = await api(
    `/api/collections/users/records?perPage=500&filter=${encodeURIComponent(
      `gym = "${message.gym}" && id != "${message.author}"`,
    )}`,
  )
  const subs = await subsFor((members?.items ?? []).map((m) => m.id))
  if (subs.length === 0) return { sent: 0, dropped: 0 }

  const payload = JSON.stringify({
    title: `${gymName}: ${message.title}`,
    body: message.body || 'Open the inbox for the details.',
    url: '/inbox',
    tag: `gym-${message.id}`,
  })

  let sent = 0
  let dropped = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 24 * 3600 },
      )
      sent += 1
    } catch (err) {
      const code = err?.statusCode
      if (code === 404 || code === 410) {
        await api(`/api/collections/push_subs/records/${sub.id}`, { method: 'DELETE' }).catch(
          () => {},
        )
        dropped += 1
      } else {
        console.error(`push: send failed (${code ?? err?.message ?? 'unknown'})`)
      }
    }
  }
  return { sent, dropped }
}

async function ring(message) {
  const gym = await api(`/api/collections/gyms/records/${message.gym}`)
  const { sent, dropped } = await deliver(message, gym?.name ?? 'Your gym')
  console.log(
    `push: "${message.title}" -> ${sent} sent${dropped ? `, ${dropped} dead subs dropped` : ''}`,
  )
}

async function tick() {
  if (!token) await login()
  const cursor = await readCursors()
  const now = nowStamp()

  /* Published on arrival: unchanged, except that it now leaves the queued ones
     alone rather than announcing them the moment they are written. */
  const immediate = await api(
    `/api/collections/gym_messages/records?perPage=100&sort=updated&filter=${encodeURIComponent(
      `updated > "${cursor.updated}" && publish_at = ""`,
    )}`,
  )
  let nextUpdated = cursor.updated
  for (const message of immediate?.items ?? []) {
    await ring(message)
    if (message.updated > nextUpdated) nextUpdated = message.updated
  }

  /**
   * Queued, and now due.
   *
   * Ordered and cursored by `publish_at` rather than `updated`, because that is
   * the moment this is about. A message deleted before its time simply never
   * appears here, which is what cancelling one should mean.
   */
  const due = await api(
    `/api/collections/gym_messages/records?perPage=100&sort=publish_at&filter=${encodeURIComponent(
      `publish_at != "" && publish_at > "${cursor.due}" && publish_at <= "${now}"`,
    )}`,
  )
  let nextDue = cursor.due
  for (const message of due?.items ?? []) {
    await ring(message)
    if (message.publish_at > nextDue) nextDue = message.publish_at
  }

  if (nextUpdated !== cursor.updated || nextDue !== cursor.due) {
    await writeCursors({ updated: nextUpdated, due: nextDue })
  }
}

console.log(`push: watching ${PB} every ${POLL_MS}ms`)
for (;;) {
  try {
    await tick()
  } catch (err) {
    console.error(`push: tick failed (${err?.message ?? err})`)
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
}
