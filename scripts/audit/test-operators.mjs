/**
 * The desk, through the app rather than the API.
 *
 * `operators-boundary.mjs` proves the rules from the receiving side and cannot
 * see a screen. This walks what a person does: an owner inviting a colleague,
 * that colleague signing in and finding they can publish, the sent list naming
 * who wrote what, and the colleague being offered no controls over the roster.
 *
 *   node scripts/audit/test-operators.mjs
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

const pb = await startSandbox()
const browser = await chromium.launch()

/** Opens a sync account for the profile that is currently unlocked. */
async function openAccount(page, email, password, server) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Repeat password').fill(password)
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(server)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
}

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
  await create('Owner Desk', 'owner-pass', { gym: 'Hierro Viejo' })
  await lock()
  await create('Coach Desk', 'coach-pass', { gym: 'Hierro Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Owner Desk', 'Gym')
  await promote('Coach Desk', 'Gym')
  await lock()

  console.log('\nthe owner')
  await unlock('Owner Desk', 'owner-pass')
  await openAccount(page, 'owner@hierro.test', 'owner-account-1', pb.base)
  const ownerAcc = await pb.userByEmail('owner@hierro.test')
  if (!ownerAcc) throw new Error('the sync dialog did not create the owner account')
  const gym = (await pb.api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [ownerAcc.id], owner: ownerAcc.id },
    pb.su)).json
  console.log('  ok    account opened, gym on Plus, owner set')

  console.log('\ninviting a colleague')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Members/ }).click()
  await page.waitForTimeout(1500)
  const seats = await page.textContent('body')
  check('the desk says how many seats the plan covers', seats.includes('of 5'), true)
  await page.getByLabel('Add somebody').fill('coach@hierro.test')
  await page.getByRole('button', { name: 'Invite' }).click()
  await page.getByText(/Invited\.|Added\./).first().waitFor({ timeout: 10000 })
  await page.waitForTimeout(800)
  const listed = await page.textContent('body')
  check('the invitation is listed as pending', listed.includes('coach@hierro.test'), true)
  check('and marked as not yet an account', listed.includes('Invited'), true)
  check('the owner is marked as the owner', listed.includes('Owner'), true)

  console.log('\nthe colleague signs in')
  await lock()
  await unlock('Coach Desk', 'coach-pass')
  /* Signing in is what claims the invitation — nothing to click. */
  await openAccount(page, 'coach@hierro.test', 'coach-account-1', pb.base)
  const coachAcc = await pb.userByEmail('coach@hierro.test')
  const roster = (await pb.api('GET', `/api/collections/gyms/records/${gym.id}`, undefined, pb.su))
    .json.operators ?? []
  check('signing in put them on the desk', roster.includes(coachAcc.id), true)

  console.log('\nand can publish as the gym')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.getByLabel('Title').fill('Written by the coach')
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/Published to/).first().waitFor({ timeout: 10000 })
  console.log('  ok    published')

  console.log('\nbut not over the roster')
  await page.getByRole('tab', { name: /^Members/ }).click()
  await page.waitForTimeout(1500)
  check('the colleague is offered no invite field',
    await page.getByLabel('Add somebody').count(), 0)
  check('nor any way to remove anybody',
    await page.getByRole('button', { name: /^(Remove|Withdraw)$/ }).count(), 0)
  const told = await page.textContent('body')
  check('and is told whose call it is',
    told.includes('account that holds this gym decides'), true)

  console.log('\nthe desk, once the invitation is accepted')
  await lock()
  await unlock('Owner Desk', 'owner-account-1')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Members/ }).click()
  await page.waitForTimeout(1800)
  const desk = await page.textContent('body')
  /**
   * The gap the first build had and this walk did not catch, because it only
   * ever looked at the desk while the invitation was still pending. `users` is
   * `id = @request.auth.id`, so fetching a colleague's row returns nothing —
   * and the failure was swallowed, drawing them as an empty seat.
   */
  check('a colleague who accepted is still on the list', desk.includes('coach@hierro.test'), true)
  check('and no longer marked as merely invited',
    /coach@hierro\.test[^A-Za-z]*Invited/.test(desk), false)
  check('the owner is still marked as the owner', desk.includes('Owner'), true)

  console.log('\nwhat the sent list says')
  await page.waitForTimeout(400)
  await page.getByRole('tab', { name: /^Sent/ }).click()
  await page.waitForTimeout(1200)
  const sent = await page.textContent('body')
  /* The half of the promise the roster is for: with two people who could have
     written it, the list has to say which one did. */
  check('it names who wrote it, now that two people could have',
    sent.includes('coach@hierro.test'), true)

  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
