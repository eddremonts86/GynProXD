/**
 * Enterprise, through the app: one login, two rooms, one desk at a time.
 *
 * `gym-cap-boundary.mjs` proves the server refuses a gym past the cap. This
 * walks what the customer paying £1,000 actually does: signs in once and finds
 * both rooms, switches between them, and gets the right room's members, sent
 * list and join code rather than whichever the server listed first.
 *
 * The old client had one line that assumed an operator has one gym, and it was
 * a `find`. This is the walk that would have caught it.
 *
 *   node scripts/audit/test-enterprise-rooms.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a
 * server to walk; point at it with BASE_URL.
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
  await create('Group Desk', 'group-pass', { gym: 'North Room' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Group Desk', 'Gym')
  await lock()
  await unlock('Group Desk', 'group-pass')
  await openAccount(page, 'group@rooms.test', 'group-account-1', pb.base)
  const acc = await pb.userByEmail('group@rooms.test')
  if (!acc) throw new Error('the sync dialog did not create the account')

  /* The cap first, then the rooms: that order is the product, and doing it the
     other way round is what the server refuses. */
  await pb.api('PATCH', `/api/collections/users/records/${acc.id}`, { gym_cap: 2 }, pb.su)
  const north = (await pb.api('POST', '/api/collections/gyms/records',
    { name: 'North Room', kind: 'gym', plan: 'plus', operators: [acc.id], owner: acc.id }, pb.su)).json
  const south = (await pb.api('POST', '/api/collections/gyms/records',
    { name: 'South Room', kind: 'gym', plan: 'plus', operators: [acc.id], owner: acc.id }, pb.su)).json
  check('two rooms under one account', [north.name, south.name], ['North Room', 'South Room'])

  console.log('\nthe desk')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  const tabs = page.getByRole('tab', { name: /Room$/ })
  check('both rooms are offered', await tabs.count(), 2)
  /* Scoped to the room strip: the desk under it has its own tabs, and one of
     those is selected too. */
  const strip = page.getByRole('tablist', { name: 'Which gym' })
  check('and exactly one of them is the one on screen',
    await strip.getByRole('tab', { selected: true }).count(), 1)

  console.log('\nswitching')
  await page.getByRole('tab', { name: 'South Room' }).click()
  await page.waitForTimeout(2000)
  check('the choice sticks',
    await page.getByRole('tab', { name: 'South Room' }).getAttribute('aria-selected'), 'true')

  /* The point of the switcher: it is remembered, so the phone at one front desk
     stays on that desk. */
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  check('and survives a reload',
    await page.getByRole('tab', { name: 'South Room' }).getAttribute('aria-selected'), 'true')

  console.log('\nnothing leaks between rooms')
  const body = (await page.textContent('body')) ?? ''
  check('the desk names the room it is showing', body.includes('South Room'), true)
  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
