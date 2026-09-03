/**
 * Pro, through the app rather than the API.
 *
 * `pro-boundary.mjs` proves the rules from the receiving side and cannot see a
 * screen. This walks the part a person touches: whether the panel tells the
 * truth about an account, and whether it tells the RIGHT truth, because two of
 * the four states it can be in mean very different things and one of them is an
 * accusation if it is worded like the other.
 *
 *   "Not checked" is a gap. We have not asked.
 *   "Free"        is an answer. The server said no.
 *
 * A member who paid, on a new device with no signal, must get the first
 * sentence. That distinction is the whole reason `decide` has a `reason` rather
 * than just a boolean, and a unit test cannot prove it reaches the screen.
 *
 * It also proves the cached answer survives a lock, which is what stops a paid
 * screen blinking out of existence in front of the person paying for it.
 *
 *   node scripts/audit/test-pro.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a dev
 * server; point at it with BASE_URL.
 */
import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const SHOTS = process.env.SHOT_DIR ?? path.join(import.meta.dirname, '../../.audit-shots')

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
let pbStopped = false
const browser = await chromium.launch()

const grantPro = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', ['scripts/admin/grant-pro.mjs', '--server', pb.base, ...args], {
      env: { ...process.env, PB_SUPERUSER_EMAIL: 'probe@enforma.test', PB_SUPERUSER_PASSWORD: 'Sup3rSecret123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => resolve({ code, out: out.trim() }))
  })

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const { create, unlock, lock } = door(page, BASE)

  /** The subscription panel, by its landmark rather than by counting divs. */
  const panel = () => page.getByRole('region', { name: 'Subscription' })
  const stateText = async () => (await panel().innerText()).replace(/\s+/g, ' ').trim()
  const openData = async () => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /^Data/ }).click()
    await panel().waitFor({ timeout: 8000 })
  }

  console.log('\na profile with no account')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Payer', 'payer-pass')
  await openData()
  check(
    'is told a subscription needs one',
    /A subscription belongs to a sync account/.test(await stateText()),
    true,
  )
  check('and is not given a state to misread', /This account/.test(await stateText()), false)

  console.log('\nonce there is an account')
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('payer@pro.test')
  await page.getByLabel('Password', { exact: true }).fill('payer-account-1')
  await page.getByLabel('Repeat password').fill('payer-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  const payer = await pb.userByEmail('payer@pro.test')
  if (!payer) throw new Error('the sync dialog did not create an account')
  await openData()
  check('the panel shows a state', /This account/.test(await stateText()), true)
  check(
    'and says nothing is on sale yet',
    /Nothing is sold yet/.test(await stateText()),
    true,
  )

  console.log('\nwith nothing paid')
  /**
   * A page load asks by itself.
   *
   * The first draft of this walk expected "Not checked" here and was wrong
   * about its own product: opening Settings is a page load, a page load runs
   * `syncQuietly`, and that probes `/me`. So by the time anybody reads this
   * panel with a reachable server, the gap has already become an answer, which
   * is the behaviour worth asserting. The gap itself only exists on a device
   * that has never reached the server, and `entitlement.spec.ts` is where that
   * is pinned down.
   */
  check('the load asked, so this is an answer', /Free/.test(await stateText()), true)
  check('with the reason spelled out', /not on Pro/.test(await stateText()), true)
  check('and not the wording for a gap', /Not checked/.test(await stateText()), false)

  console.log('\nasking again by hand')
  await panel().getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  check('says the same thing', /Free/.test(await stateText()), true)

  console.log('\nafter a grant')
  const granted = await grantPro(['--account', 'payer@pro.test', '--months', '1'])
  check('the script exits clean', granted.code, 0)
  await panel().getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  const paid = await stateText()
  check('the panel says Pro', /Pro/.test(paid), true)
  check('and names the date it is paid to', /Paid up to \d+ \w+ \d{4}/.test(paid), true)
  check('and no longer says Free', /Free/.test(paid), false)
  /* One picture of the state somebody paid for, for whoever reads the run. */
  await mkdir(SHOTS, { recursive: true })
  await panel().screenshot({ path: path.join(SHOTS, 'pro-subscription.png') })

  console.log('\nwhen it is revoked')
  check('the script exits clean', (await grantPro(['--account', 'payer@pro.test', '--revoke'])).code, 0)
  await panel().getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  check('the panel drops back to Free', /Free/.test(await stateText()), true)

  console.log('\nand when it is granted again')
  check('the script exits clean', (await grantPro(['--account', 'payer@pro.test', '--months', '1'])).code, 0)
  await panel().getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  check('the panel is Pro again', /Paid up to/.test(await stateText()), true)

  console.log('\nacross a lock, with the server gone')
  /**
   * The reason `adoptEntitlement` exists, proved the only way it can be.
   *
   * With a reachable server this check would pass whether or not the cache is
   * ever consulted, because the page load probes `/me` anyway. So the sandbox
   * is stopped first: from here the device knows nothing except what it wrote
   * down, which is exactly the situation of a paying member on a train. If the
   * cached answer were not adopted on unlock, this is where a paid screen would
   * vanish in front of the person paying for it.
   */
  await lock()
  await pb.stop()
  pbStopped = true
  await unlock('Payer', 'payer-account-1')
  await openData()
  const offline = await stateText()
  check('Pro is still on screen, from the cache alone', /Paid up to/.test(offline), true)
  check('and nobody is told they have not paid', /not on Pro/.test(offline), false)

  console.log('\nthe console')
  check('nothing threw', errors, [])
} finally {
  await browser.close()
  if (!pbStopped) await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
