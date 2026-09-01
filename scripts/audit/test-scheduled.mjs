/**
 * Scheduled publishing, through the app rather than the API.
 *
 * `scheduled-boundary.mjs` proves the server withholds a queued message and
 * cannot see a screen. This walks the two things a person does: an operator
 * queueing one and being told plainly that it has reached nobody, and a member
 * whose inbox stays empty until it is time.
 *
 * The wait is real — a message two seconds out, then the clock passing it — so
 * this is slow on purpose. A schedule tested by mocking the clock proves the
 * mock works.
 *
 *   node scripts/audit/test-scheduled.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a dev
 * server; point at it with BASE_URL.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

/** What `<input type="datetime-local">` wants, in the browser's own timezone. */
const localStamp = (ms) => {
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const pb = await startSandbox()
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const { create, unlock, lock, promote } = door(page, BASE)

  console.log('\ncast')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Root', 'root-pass')
  await lock()
  await create('Ana', 'ana-pass', { gym: 'Hierro Viejo' })
  await lock()
  await create('Hierro Desk', 'desk-pass', { gym: 'Hierro Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Hierro Desk', 'Gym')
  await lock()
  await unlock('Hierro Desk', 'desk-pass')
  console.log('  ok    a member and an operator')

  console.log('\nthe gym goes Plus')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('desk@hierroviejo.test')
  await page.getByLabel('Password', { exact: true }).fill('desk-account-1')
  await page.getByLabel('Repeat password').fill('desk-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  const operator = await pb.userByEmail('desk@hierroviejo.test')
  if (!operator) throw new Error('the sync dialog did not create an account')
  await pb.api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [operator.id] }, pb.su)
  console.log('  ok    account opened, gym on Plus')

  console.log('\nqueueing one')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const when = page.getByLabel('Publish at')
  check('Plus offers a time', (await when.count()) > 0, true)
  await page.getByLabel('Title').fill('Monday menu')
  /* Forty seconds out: long enough to still be queued while the member looks,
     short enough that waiting for it to arrive is not a coffee break. */
  const dueAt = Date.now() + 40_000
  await when.fill(localStamp(dueAt))
  await page.waitForTimeout(300)
  const composer = await page.textContent('body')
  check('and says plainly that nobody can read it yet',
    composer.includes('Nobody can read it until then'), true)
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/Queued for/).first().waitFor({ timeout: 10000 })
  const said = await page.textContent('body')
  /* The line must not claim a delivery. A queued message has reached nobody. */
  check('the confirmation does not claim it was published to anybody',
    /Published to \d/.test(said), false)
  console.log('  ok    queued')

  console.log('\nwhat the gym sees')
  await page.getByRole('tab', { name: /^Sent/ }).click()
  await page.waitForTimeout(600)
  const sent = await page.textContent('body')
  check('Sent lists it with its time', sent.includes('goes out'), true)
  /* "read 0" on something nobody could open reads as a failure, not a queue. */
  check('and does not show it a tally of nobody', /goes out[^·]*· read 0/.test(sent), false)

  console.log('\nwhat the member sees')
  await lock()
  await unlock('Ana', 'ana-pass')
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  check('nothing, while it waits',
    (await page.textContent('body')).includes('Monday menu'), false)

  console.log('\nand when the clock passes it')
  /**
   * The same message, waited out for real.
   *
   * An earlier version wrote a fresh row straight to the server and waited for
   * that — which proved nothing, because this member has no sync account and
   * nothing written over the API was ever going to reach their device. The copy
   * that matters here is the one the gym published on this very device, and the
   * only honest way past its time is to wait for it.
   */
  const remaining = dueAt - Date.now() + 2000
  if (remaining > 0) await new Promise((r) => setTimeout(r, remaining))
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  check('the member finds it once its time has come',
    (await page.textContent('body')).includes('Monday menu'), true)

  console.log('\nand the gym stops calling it queued')
  await lock()
  await unlock('Hierro Desk', 'desk-account-1')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Sent/ }).click()
  await page.waitForTimeout(600)
  const after = await page.textContent('body')
  check('Sent shows it as sent, not as waiting', after.includes('goes out'), false)

  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
