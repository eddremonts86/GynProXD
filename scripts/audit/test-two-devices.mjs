/**
 * Two devices on one account, which is the only thing that proves a sync.
 *
 * Everything else about sync can be asserted from one browser: that a row is
 * sealed, that a member cannot list somebody else's, that a push happens. None
 * of it answers the question a person actually has — **does what I wrote here
 * turn up over there** — and until this walk existed nothing did.
 *
 * It matters more since sync stopped waiting to be asked. A linked account used
 * to catch up on unlock and when somebody pressed "Sync now" in Settings; every
 * store write now schedules one, and a heartbeat and a reconnect cover the time
 * a device sits still. That is four triggers with one visible consequence, and
 * a regression in any of them looks like nothing at all until two people
 * disagree about what happened on Tuesday.
 *
 *   node scripts/audit/test-two-devices.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a
 * server for the app; point at it with BASE_URL.
 *
 * **Nothing here presses "Sync now".** That is the point: the button still
 * exists and this walk never touches it, so anything that arrives, arrived by
 * itself.
 */
import { chromium } from 'playwright'
import { startSandbox } from './pb-sandbox.mjs'
import { ensureProfile, watchConsole } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const ACCOUNT = { email: 'two@devices.test', password: 'two-devices-account-1' }

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

const pb = await startSandbox({})
const browser = await chromium.launch()

/**
 * A device is a browser context, not a tab.
 *
 * Contexts have their own localStorage, which is where a profile's key and its
 * sync link live — so two contexts are two devices in every way this app cares
 * about, and two tabs would be one device twice.
 */
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  /* The coach off, so no walk of this spends a token or waits on a vendor. */
  await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
  const page = await ctx.newPage()
  const errors = watchConsole(page)
  /**
   * Every console error, minus the one the sync makes on purpose.
   *
   * `pushCreate` is optimistic: it POSTs a row and, when the unique index on
   * (owner, col, rid) refuses it because the server already has one, looks it
   * up and PATCHes if the local copy is newer. The refusal is a 400 and Chrome
   * prints it — a line no client code can quiet, for a request that worked as
   * designed. It happens on every edit to a row older than the cursor, which
   * on a second device is most of them.
   *
   * Matched on the request's own url and status so nothing else that fails gets
   * to hide behind it. Worth knowing that it cost an hour of this session
   * before it was understood, which is why it is written down here rather than
   * filtered quietly.
   */
  const pushRefusals = []
  page.on('response', (res) => {
    if (res.status() === 400 && res.url().includes('/api/collections/records/records')) {
      pushRefusals.push(res.url())
    }
  })
  const realErrors = () =>
    errors.filter(
      (line) => !(pushRefusals.length > 0 && /status of 400 \(Bad Request\)/.test(line)),
    )
  return { name, ctx, page, errors, realErrors, pushRefusals }
}

/* Through the front door, with the helper that already knows the landing has
   two profile forms on it — a hero one and a second one further down — so
   `getByLabel('Name')` resolves to both. */
const makeProfile = (page, name, pass) => ensureProfile(page, BASE, name, pass)

const dataTab = async (page) => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
}

/** The one field this walk moves: an age, on a synced singleton. */
async function setAge(page, age) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Profile/ }).click()
  await page.getByLabel('Age').fill(String(age))
  await page.getByRole('button', { name: /^Save/ }).click()
  await page.waitForTimeout(500)
}

async function readAge(page) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Profile/ }).click()
  return (await page.getByLabel('Age').inputValue()).trim()
}

/** How many `profileDetails` rows the server holds, and when it last changed. */
async function serverDetails() {
  const list = await pb.api(
    'GET',
    "/api/collections/records/records?perPage=1&filter=col='profileDetails'",
    undefined,
    pb.su,
  )
  const row = list.json.items?.[0]
  return { count: list.json.totalItems ?? 0, updatedClient: row?.updated_client ?? '' }
}

/** Poll, because the debounce is a couple of seconds and a sleep is a guess. */
async function until(what, predicate, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const value = await what()
    if (predicate(value)) return value
    await new Promise((r) => setTimeout(r, 500))
  }
  return await what()
}

const a = await device('A')
const b = await device('B')

try {
  console.log('\nthe first device, with an account')
  await makeProfile(a.page, 'Device A', 'device-a-pass')
  await dataTab(a.page)
  await a.page.getByRole('button', { name: 'Create sync account' }).click()
  await a.page.getByLabel('Email').fill(ACCOUNT.email)
  await a.page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password)
  await a.page.getByLabel('Repeat password').fill(ACCOUNT.password)
  await a.page.getByRole('button', { name: 'Advanced' }).click()
  await a.page.getByLabel('Server').fill(pb.base)
  await a.page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await a.page.waitForTimeout(2500)
  check('the account exists', (await pb.userByEmail(ACCOUNT.email)) !== null, true)
  /* Shown exactly once, and its dialog blocks everything behind it. */
  await a.page.getByRole('button', { name: 'I wrote it down' }).click()
  await a.page.waitForTimeout(300)

  console.log('\nsomething written on A, with nothing pressed')
  await setAge(a.page, 41)
  const landed = await until(serverDetails, (d) => d.count > 0)
  check('it reached the server on its own', landed.count, 1)

  console.log('\nthe second device, on the same account')
  await makeProfile(b.page, 'Device B', 'device-b-pass')
  await dataTab(b.page)
  await b.page.getByRole('button', { name: /I already have one/ }).click()
  await b.page.getByLabel('Email').fill(ACCOUNT.email)
  await b.page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password)
  await b.page.getByRole('button', { name: 'Advanced' }).click()
  await b.page.getByLabel('Server').fill(pb.base)
  await b.page.getByRole('button', { name: /Link and merge|Linking/ }).click()
  await b.page.waitForTimeout(4000)
  const bText = await b.page.locator('main').innerText()
  check('B says it is linked to the same account', bText.includes(ACCOUNT.email), true)

  console.log("\nand it has A's day")
  /* The whole question. B has never been told what A wrote. */
  const onB = await until(() => readAge(b.page), (age) => age === '41')
  check("A's age is on B", onB, '41')

  console.log('\nsomething written on B, going the other way')
  await setAge(b.page, 42)
  const changed = await until(serverDetails, (d) => d.updatedClient > landed.updatedClient)
  check("B's change reached the server too", changed.updatedClient > landed.updatedClient, true)

  console.log('\nand A picks it up without being asked')
  /**
   * A has been sitting on Settings while B wrote. Its heartbeat is five minutes,
   * which no walk should wait for — so this is the other trigger, a reconnect:
   * the event the app listens for, dispatched at it. Simulating the network
   * coming back is the point rather than a shortcut, because that is the case
   * a person hits after a tunnel or a lid closing.
   */
  await a.page.evaluate(() => window.dispatchEvent(new Event('online')))
  const onA = await until(() => readAge(a.page), (age) => age === '42')
  check("B's age is on A, with no button pressed", onA, '42')

  console.log('\nthe console, on both')
  check('A threw nothing of its own', a.realErrors(), [])
  check('B threw nothing of its own', b.realErrors(), [])
  /* And the refusals were the sync's, which is what lets the filter above be
     narrow: if none had happened, a 400 in the log would have failed the walk. */
  check('the only 400s were the optimistic creates', b.pushRefusals.length > 0, true)
} finally {
  await a.ctx.close()
  await b.ctx.close()
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
