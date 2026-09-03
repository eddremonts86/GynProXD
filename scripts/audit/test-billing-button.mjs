/**
 * The subscribe button, through the app, against the real Stripe test API.
 *
 * `billing-boundary.mjs` proves the webhook cannot be lied to and never opens a
 * browser. This walks the other half: an owner at their desk, the panel that
 * says what they pay, and the click that has to come back with a Stripe page.
 *
 * The click is intercepted rather than followed. What matters is the URL the app
 * was handed, and following it would put a Playwright walk on Stripe's checkout
 * page, which is Stripe's to test and not ours.
 *
 * A colleague who is not the owner is checked too, because "only the owner is
 * billed" is a rule the server holds and the panel must not contradict by
 * offering a button that would be refused.
 *
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/audit/test-billing-button.mjs
 *
 * Skipped, loudly, without a key: the point of it is the real round trip.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const SK = process.env.STRIPE_SECRET_KEY ?? ''

if (!SK.startsWith('sk_test_')) {
  console.log('\nskipped: needs STRIPE_SECRET_KEY (a test key) to be worth running\n')
  process.exit(0)
}

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

const pb = await startSandbox({ env: { STRIPE_SECRET_KEY: SK, STRIPE_WEBHOOK_SECRET: 'whsec_unused_here' } })
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  /* Stripe's page is Stripe's to test, so the navigation is caught at the
     network and stopped there. Overriding `window.location.assign` was the
     first attempt and does not hold: it is not reliably writable, and the
     assertion failed while the checkout had in fact worked. */
  let sentTo = null
  await ctx.route('https://checkout.stripe.com/**', (route) => {
    sentTo = route.request().url()
    return route.abort()
  })
  const { create, unlock, lock, promote } = door(page, BASE)

  console.log('\ncast')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Root', 'root-pass')
  await lock()
  await create('Owner Desk', 'owner-pass', { gym: 'Cobre Viejo' })
  await lock()
  await create('Coach Desk', 'coach-pass', { gym: 'Cobre Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Owner Desk', 'Gym')
  await promote('Coach Desk', 'Gym')
  await lock()

  await unlock('Owner Desk', 'owner-pass')
  await openAccount(page, 'owner@cobre.test', 'owner-account-1', pb.base)
  const owner = await pb.userByEmail('owner@cobre.test')
  if (!owner) throw new Error('the sync dialog did not create the owner account')
  await pb.api('POST', '/api/collections/gyms/records',
    { name: 'Cobre Viejo', kind: 'gym', plan: 'base', operators: [owner.id], owner: owner.id }, pb.su)
  console.log('  ok    a gym on Base, owned by the account at the desk')

  console.log('\nwhat the owner is shown')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)
  /* Its own tab, and only the owner has one. */
  check('the owner is offered a Billing tab',
    await page.getByRole('tab', { name: 'Billing' }).count(), 1)
  await page.getByRole('tab', { name: 'Billing' }).click()
  await page.waitForTimeout(800)
  const body = await page.textContent('body')
  check('the panel says what the gym pays', body.includes('What this gym pays'), true)
  check('and that nobody has taken a card yet', body.includes('Invoiced by hand'), true)
  check('Plus is offered', await page.getByRole('button', { name: /Subscribe to Plus/ }).count(), 1)
  check('so is Enterprise', await page.getByRole('button', { name: /Subscribe to Enterprise/ }).count(), 1)
  /* Never a card field in this product: the whole point of handing off. */
  check('and no card is asked for here',
    await page.locator('input[autocomplete*="cc-"], input[name*="card"]').count(), 0)

  console.log('\nthe click')
  await page.getByRole('button', { name: /Subscribe to Plus/ }).click()
  await page.waitForTimeout(12000)
  check('it comes back with a Stripe checkout page',
    /^https:\/\/checkout\.stripe\.com\//.test(String(sentTo)), true)
  const stored = await pb.userByEmail('owner@cobre.test')
  check('and the account remembers its Stripe customer',
    /^cus_/.test(String(stored.stripe_customer ?? '')), true)

  console.log('\nwhat a colleague is shown')
  await lock()
  await unlock('Coach Desk', 'coach-pass')
  await openAccount(page, 'coach@cobre.test', 'coach-account-1', pb.base)
  const coach = await pb.userByEmail('coach@cobre.test')
  const gyms = await pb.api('GET',
    `/api/collections/gyms/records?filter=${encodeURIComponent('name = "Cobre Viejo"')}`, undefined, pb.su)
  await pb.api('PATCH', `/api/collections/gyms/records/${gyms.json.items[0].id}`,
    { operators: [owner.id, coach.id] }, pb.su)
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)
  check('an operator who is not the owner has no Billing tab',
    await page.getByRole('tab', { name: 'Billing' }).count(), 0)
  const coachBody = await page.textContent('body')
  check('and no billing panel anywhere',
    coachBody.includes('What this gym pays'), false)
  check('and is offered no button that would be refused',
    await page.getByRole('button', { name: /Subscribe to/ }).count(), 0)
  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
