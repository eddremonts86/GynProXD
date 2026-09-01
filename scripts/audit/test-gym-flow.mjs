/**
 * The panels proof: a gym profile publishes templated messages, its member
 * receives exactly the right ones, interacts (RSVP, save, QR), the gym sees
 * the tallies, and the admin panel manages roles and gyms globally.
 *
 * The cast starts with an administrator because that is now how a device works:
 * the first profile created on one becomes its admin, and gym and admin roles
 * are granted from the admin panel rather than chosen at the door. A walk that
 * picks "Gym — I run a gym" while signing up is testing a version of the app
 * that no longer exists.
 *
 *   node scripts/audit/test-gym-flow.mjs
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
const { create, unlock, lock, promote } = door(page, BASE)

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

// 1. An administrator, a member, and the profile that will run their gym.
await page.goto(BASE, { waitUntil: 'networkidle' })
await create('Root', 'root-pass')
await lock()
await create('Rio', 'rio-pass', { gym: 'Anchor Point' })
console.log('ok: member created with a gym')

await lock()
await create('Anchor Desk', 'desk-pass', { gym: 'Anchor Point' })
await lock()
await unlock('Root', 'root-pass')
await promote('Anchor Desk', 'Gym')
await lock()
await unlock('Anchor Desk', 'desk-pass')
console.log('ok: operator promoted from the admin panel')

// 2. The gym panel exists, lists the member, and publishes an offer.
await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 10000 })
if (!(await page.textContent('body'))?.includes('Rio')) fail('gym panel does not list its member')
await page.getByRole('radio', { name: 'Offer' }).click()
await page.getByLabel('Title').fill('Grand reopening')
await page.getByLabel('Discount').fill('Half price day passes')
await page.getByRole('button', { name: 'Publish' }).click()
/* Matched loosely: the line ends "…on this device. It is now under Sent.", and
   the old walk pinned the full stop that used to follow "member". */
await page.getByText(/Published to 1 member/).first().waitFor({ timeout: 10000 })
const code = await page.getByLabel('Redemption code').inputValue().catch(() => null)
console.log('ok: gym published an offer')

// 3. An event too, targeted at the member explicitly.
await page.getByRole('radio', { name: 'Event' }).click()
await page.getByLabel('Title').fill('Mobility workshop')
await page.getByLabel('Date').fill('2027-01-15')
await page.getByRole('button', { name: /^Rio$/ }).click()
await page.getByRole('button', { name: 'Publish' }).click()
await page.getByText(/Published to 1 member/).first().waitFor({ timeout: 10000 })
console.log('ok: gym published a targeted event')

// 4. The member sees both, the QR renders, RSVP and save register.
await lock()
await unlock('Rio', 'rio-pass')
const badge = await page.getByLabel(/unread/).first().textContent().catch(() => null)
if (badge !== '2') fail(`expected unread badge 2, got ${badge}`)
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.getByText('Grand reopening').first().waitFor({ timeout: 10000 })
await page.getByText('Mobility workshop').first().waitFor({ timeout: 10000 })
/* The inbox is a list and a reading pane now: the QR and the answer buttons
   live on the opened message, not on a column of cards. */
await page.getByText('Grand reopening').first().click()
/* Waited for rather than counted. `count()` has no auto-wait, so this asked
   whether the QR was there before the reading pane had rendered and answered
   no — about a QR that renders fine. */
await page
  .locator('svg[role=img][aria-label*="Offer code"]')
  .first()
  .waitFor({ timeout: 10000 })
  .catch(() => fail('offer QR code not rendered'))
await page.getByRole('button', { name: 'Save offer' }).click()
await page.getByRole('button', { name: 'Saved', exact: true }).waitFor({ timeout: 10000 })
await page.getByText('Mobility workshop').first().click()
await page.getByRole('button', { name: 'Going' }).click()
await page.getByText('See you there.').waitFor({ timeout: 10000 })
console.log('ok: member read, RSVPed and saved with the QR rendered')

// 5. The gym sees the tallies.
await lock()
await unlock('Anchor Desk', 'desk-pass')
await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
await page.getByRole('tab', { name: /^Sent/ }).click()
const sent = await page.textContent('body')
if (!sent?.includes('going 1')) fail('RSVP tally missing from sent list')
if (!sent?.includes('saved 1')) fail('save tally missing from sent list')
console.log('ok: gym sees read/RSVP/save tallies')

// 5b. Operators have no Inbox (dead by construction) and /inbox bounces.
if (await page.getByRole('link', { name: 'Inbox' }).count()) {
  fail('gym operator still shows an Inbox nav item')
}
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 10000 })
console.log('ok: operator inbox is hidden and bounces to the panel')

// 6. Members never leak across gyms: a stranger sees nothing.
await lock()
await create('Vera', 'vera-pass', { gym: 'Other Place' })
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
/* "Nothing from Other Place or enForma yet": the house gym joined the sentence
   when it started sharing this inbox. */
if (!(await page.textContent('body'))?.includes('Nothing from Other Place')) {
  fail('a member of another gym can see foreign messages')
}
console.log('ok: messages never cross gyms')

// 7. Admin: role management and gym rename propagate.
await lock()
await unlock('Root', 'root-pass')
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Admin', exact: true }).waitFor({ timeout: 10000 })

await promote('Vera', 'Gym')
const regAfterRole = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
if (regAfterRole.profiles.find((p) => p.name === 'Vera')?.role !== 'gym') {
  fail('admin role change did not stick')
}
console.log('ok: admin promoted a profile to gym')

await page.getByRole('tab', { name: /^Gyms/ }).click()
await page.getByRole('button', { name: 'Rename Anchor Point' }).click()
await page.getByLabel('New name for Anchor Point').fill('Anchor Point East')
await page.getByRole('button', { name: 'Rename', exact: true }).click()
await page.waitForTimeout(400)
const regAfterRename = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
const rio = regAfterRename.profiles.find((p) => p.name === 'Rio')
if (rio?.gym !== 'Anchor Point East') fail(`gym rename did not propagate: ${rio?.gym}`)
console.log('ok: gym rename propagated to member profiles')

// 8. Renaming migrated the messages too: the member's inbox survives.
await lock()
await unlock('Rio', 'rio-pass')
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.getByText('Grand reopening').first().waitFor({ timeout: 10000 })
console.log('ok: inbox survives a gym rename')
if (code) console.log(`note: offer code was ${code}`)

await browser.close()
if (!process.exitCode) console.log('\ngym flow ok')
