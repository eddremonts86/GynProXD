/**
 * The panels proof: a gym profile publishes templated messages, its member
 * receives exactly the right ones, interacts (RSVP, save, QR), the gym sees
 * the tallies, and the admin panel manages roles and gyms globally.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

const gate = () => page.getByRole('heading', { name: 'Who is training?' })
const inApp = () => page.getByRole('link', { name: 'enForma, go to today' }).waitFor({ timeout: 10000 })

const lock = async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock profile' }).click()
  await gate().waitFor({ timeout: 5000 })
}

const unlock = async (name, pass) => {
  await page.getByRole('button', { name }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(pass)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await inApp()
}

// 1. A member and their gym's operator profile.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Create your profile' }).waitFor({ timeout: 5000 })
await page.getByLabel('Name').fill('Rio')
await page.getByLabel('Gym', { exact: true }).fill('Anchor Point')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('rio-pass')
await page.getByLabel('Repeat passphrase').fill('rio-pass')
await page.getByRole('button', { name: 'Create profile' }).click()
await inApp()
console.log('ok: member created with a gym')

await lock()
await page.getByRole('button', { name: 'New profile' }).click()
await page.getByLabel('Name').fill('Anchor Desk')
await page.getByRole('combobox', { name: 'Profile type' }).click()
await page.getByRole('option', { name: 'Gym — I run a gym' }).click()
await page.getByLabel('Gym', { exact: true }).fill('Anchor Point')
await page.getByRole('option', { name: 'Anchor Point' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('desk-pass')
await page.getByLabel('Repeat passphrase').fill('desk-pass')
await page.getByRole('button', { name: 'Create profile' }).click()
await inApp()

// 2. The gym panel exists, lists the member, and publishes an offer.
await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 5000 })
if (!(await page.textContent('body'))?.includes('Rio')) fail('gym panel does not list its member')
await page.getByRole('radio', { name: 'Offer' }).click()
await page.getByLabel('Title').fill('Grand reopening')
await page.getByLabel('Discount').fill('Half price day passes')
await page.getByRole('button', { name: 'Publish' }).click()
await page.getByText('Published to 1 member.').waitFor({ timeout: 5000 })
const code = await page.getByLabel('Redemption code').inputValue().catch(() => null)
console.log('ok: gym published an offer')

// 3. An event too, targeted at the member explicitly.
await page.getByRole('radio', { name: 'Event' }).click()
await page.getByLabel('Title').fill('Mobility workshop')
await page.getByLabel('Date').fill('2027-01-15')
await page.getByRole('button', { name: /^Rio$/ }).click()
await page.getByRole('button', { name: 'Publish' }).click()
await page.getByText('Published to 1 member.').waitFor({ timeout: 5000 })
console.log('ok: gym published a targeted event')

// 4. The member sees both, the QR renders, RSVP and save register.
await lock()
await unlock('Rio', 'rio-pass')
const badge = await page.getByLabel(/unread/).first().textContent().catch(() => null)
if (badge !== '2') fail(`expected unread badge 2, got ${badge}`)
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.getByText('Grand reopening').waitFor({ timeout: 5000 })
await page.getByText('Mobility workshop').waitFor({ timeout: 5000 })
if ((await page.locator('svg[role=img][aria-label*="Offer code"]').count()) !== 1) {
  fail('offer QR code not rendered')
}
await page.getByRole('button', { name: 'Going' }).click()
await page.getByText('See you there.').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'Save offer' }).click()
await page.getByRole('button', { name: 'Saved', exact: true }).waitFor({ timeout: 5000 })
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
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 5000 })
console.log('ok: operator inbox is hidden and bounces to the panel')

// 6. Members never leak across gyms: a stranger sees nothing.
await lock()
await page.getByRole('button', { name: 'New profile' }).click()
await page.getByLabel('Name').fill('Vera')
await page.getByLabel('Gym', { exact: true }).fill('Other Place')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('vera-pass')
await page.getByLabel('Repeat passphrase').fill('vera-pass')
await page.getByRole('button', { name: 'Create profile' }).click()
await inApp()
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
if (!(await page.textContent('body'))?.includes('Nothing from Other Place yet')) {
  fail('a member of another gym can see foreign messages')
}
console.log('ok: messages never cross gyms')

// 7. Admin: role management and gym rename propagate.
await lock()
await page.getByRole('button', { name: 'New profile' }).click()
await page.getByLabel('Name').fill('Root')
await page.getByRole('combobox', { name: 'Profile type' }).click()
await page.getByRole('option', { name: 'Administrator' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('root-pass')
await page.getByLabel('Repeat passphrase').fill('root-pass')
await page.getByRole('button', { name: 'Create profile' }).click()
await inApp()
await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Admin', exact: true }).waitFor({ timeout: 5000 })

await page.getByRole('combobox', { name: 'Role for Vera' }).click()
await page.getByRole('option', { name: 'Gym' }).click()
const regAfterRole = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
if (regAfterRole.profiles.find((p) => p.name === 'Vera')?.role !== 'gym') {
  fail('admin role change did not stick')
}
console.log('ok: admin promoted a profile to gym')

await page.getByRole('button', { name: 'Rename Anchor Point' }).click()
await page.getByLabel('New name for Anchor Point').fill('Anchor Point East')
await page.getByRole('button', { name: 'Rename', exact: true }).click()
const regAfterRename = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
const rio = regAfterRename.profiles.find((p) => p.name === 'Rio')
if (rio?.gym !== 'Anchor Point East') fail(`gym rename did not propagate: ${rio?.gym}`)
console.log('ok: gym rename propagated to member profiles')

// 8. Renaming migrated the messages too: the member's inbox survives.
await lock()
await unlock('Rio', 'rio-pass')
await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
await page.getByText('Grand reopening').waitFor({ timeout: 5000 })
console.log('ok: inbox survives a gym rename')
if (code) console.log(`note: offer code was ${code}`)

await browser.close()
if (!process.exitCode) console.log('\ngym flow ok')
