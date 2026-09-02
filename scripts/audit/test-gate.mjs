/**
 * The gate proof: signup validation anchors to the failing field and moves
 * focus there, passphrases can be revealed, mode switches clear typed
 * secrets, role tags show on the lock screen, and unlocking lands each
 * role on its own desk.
 */
import { chromium } from 'playwright'
import { door, panelOf } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

/**
 * This walk tests the door itself — validation, focus, the reveal toggle — so
 * it cannot hand the door to `door()` the way the others do. It scopes every
 * selector to the hero panel instead: the landing renders the sign-in panel
 * twice, and an unscoped `getByLabel('Name')` is a strict-mode violation that
 * kept this walk dead for weeks. Field ids carry the panel's prefix (`hero-`).
 */
const panel = () => panelOf(page).first()
const { create, unlock, promote, card } = door(page, BASE)

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

const inApp = () => page.getByRole('link', { name: 'enForma, go to today' }).waitFor({ timeout: 10000 })
const submitCreate = () => panel().getByRole('button', { name: 'Create profile' }).click()
const focusedId = () => page.evaluate(() => document.activeElement?.id ?? null)

// 1. Validation cascade: each error under its own field, focus follows.
await page.goto(BASE, { waitUntil: 'networkidle' })
await panel().getByRole('heading', { name: 'Create your profile' }).waitFor({ timeout: 5000 })

await submitCreate()
await page.locator('#hero-name-err').getByText('Give the profile a name.').waitFor({ timeout: 3000 })
if ((await focusedId()) !== 'hero-name') fail(`focus after name error: ${await focusedId()}`)
console.log('ok: empty name -> error under Name, focus on Name')

await panel().getByLabel('Name').fill('Sol')
/* Roles are no longer chosen at the door — the first profile is the device
   admin and the rest are granted from /admin — so the old "gym role without a
   gym" step tested a control that does not exist. */
await panel().getByLabel('Passphrase', { exact: true }).fill('ab')
await submitCreate()
await page.locator('#hero-passphrase-err').waitFor({ timeout: 3000 })
console.log('ok: short passphrase -> error under Passphrase')

await panel().getByLabel('Passphrase', { exact: true }).fill('sol-pass')
await panel().getByLabel('Repeat passphrase').fill('sol-other')
await submitCreate()
await page.locator('#hero-repeat-passphrase-err').waitFor({ timeout: 3000 })
console.log('ok: mismatch -> error under Repeat passphrase')

// 2. Reveal toggle flips both fields; nothing red survives a fix.
await panel().getByRole('button', { name: 'Show passphrase' }).first().click()
const types = await page.evaluate(() => [
  document.getElementById('hero-passphrase')?.type,
  document.getElementById('hero-repeat-passphrase')?.type,
])
if (types.join(',') !== 'text,text') fail(`reveal toggle types: ${types}`)
await panel().getByRole('button', { name: 'Hide passphrase' }).first().click()
console.log('ok: reveal toggle flips both passphrase fields')

// 3. Create a member, then a gym profile; check role landing on '/'.
await panel().getByLabel('Repeat passphrase').fill('sol-pass')
await submitCreate()
await inApp()
console.log('ok: profile created after fixing every error')

const lock = async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock profile' }).click()
  await panel().getByRole('heading', { name: 'Who is training?' }).waitFor({ timeout: 5000 })
}

await lock()
await panel().getByRole('button', { name: 'New profile' }).click()
// Mode switch must clear anything typed before.
const leftover = await panel().getByLabel('Passphrase', { exact: true }).inputValue()
if (leftover !== '') fail(`mode switch leaked a passphrase: "${leftover}"`)
console.log('ok: switching modes clears typed passphrases')

/* Not a validation step, so the shared door does the typing. Granted from the
   admin panel by the device admin — Sol, the first profile — which is the only
   way a gym role exists now. */
await create('Sol Desk', 'desk-pass', { gym: 'Solhouse' })
await lock()
await unlock('Sol', 'sol-pass')
await promote('Sol Desk', 'Gym')
await lock().catch(() => {})

// 4. Role tags on the lock screen.
const deskCard = card('Sol Desk')
if (!(await deskCard.textContent())?.includes('Gym')) fail('gym role tag missing on lock screen')
console.log('ok: gym card carries its role tag')

// 5. Unlocking a gym profile from '/' lands on its desk without an Inbox.
await page.goto(BASE, { waitUntil: 'networkidle' })
await deskCard.click()
await panel().getByLabel('Passphrase', { exact: true }).fill('desk-pass')
await panel().getByRole('button', { name: 'Unlock' }).click()
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 10000 })
if (await page.getByRole('link', { name: 'Inbox' }).count()) {
  fail('gym operator shows an Inbox nav item')
}
console.log('ok: gym unlock lands on /gym with no Inbox')

// 6. Wrong passphrase still anchors to the unlock field.
await lock()
await card('Sol').click()
await panel().getByLabel('Passphrase', { exact: true }).fill('wrong-pass')
await panel().getByRole('button', { name: 'Unlock' }).click()
await page.locator('#hero-passphrase-err').getByText('does not open').waitFor({ timeout: 5000 })
console.log('ok: wrong passphrase error under the unlock field')

await browser.close()
if (!process.exitCode) console.log('\ngate flow ok')
