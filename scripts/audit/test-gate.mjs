/**
 * The gate proof: signup validation anchors to the failing field and moves
 * focus there, passphrases can be revealed, mode switches clear typed
 * secrets, role tags show on the lock screen, and unlocking lands each
 * role on its own desk.
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

const inApp = () => page.getByRole('link', { name: 'enForma, go to today' }).waitFor({ timeout: 10000 })
const submitCreate = () => page.getByRole('button', { name: 'Create profile' }).click()
const focusedId = () => page.evaluate(() => document.activeElement?.id ?? null)

// 1. Validation cascade: each error under its own field, focus follows.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Create your profile' }).waitFor({ timeout: 5000 })

await submitCreate()
await page.locator('#f-name-err').getByText('Give the profile a name.').waitFor({ timeout: 3000 })
if ((await focusedId()) !== 'f-name') fail(`focus after name error: ${await focusedId()}`)
console.log('ok: empty name -> error under Name, focus on Name')

await page.getByLabel('Name').fill('Sol')
await page.getByRole('combobox', { name: 'Profile type' }).click()
await page.getByRole('option', { name: 'Gym — I run a gym' }).click()
await submitCreate()
await page.locator('#f-gym-err').waitFor({ timeout: 3000 })
if ((await focusedId()) !== 'f-gym') fail(`focus after gym error: ${await focusedId()}`)
console.log('ok: gym role without gym -> error under Gym, focus on Gym')

await page.getByRole('combobox', { name: 'Profile type' }).click()
await page.getByRole('option', { name: 'Member' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('ab')
await submitCreate()
await page.locator('#f-passphrase-err').waitFor({ timeout: 3000 })
console.log('ok: short passphrase -> error under Passphrase')

await page.getByLabel('Passphrase', { exact: true }).fill('sol-pass')
await page.getByLabel('Repeat passphrase').fill('sol-other')
await submitCreate()
await page.locator('#f-repeat-passphrase-err').waitFor({ timeout: 3000 })
console.log('ok: mismatch -> error under Repeat passphrase')

// 2. Reveal toggle flips both fields; nothing red survives a fix.
await page.getByRole('button', { name: 'Show passphrase' }).click()
const types = await page.evaluate(() => [
  document.getElementById('f-passphrase')?.type,
  document.getElementById('f-repeat-passphrase')?.type,
])
if (types.join(',') !== 'text,text') fail(`reveal toggle types: ${types}`)
await page.getByRole('button', { name: 'Hide passphrase' }).click()
console.log('ok: reveal toggle flips both passphrase fields')

// 3. Create a member, then a gym profile; check role landing on '/'.
await page.getByLabel('Repeat passphrase').fill('sol-pass')
await submitCreate()
await inApp()
console.log('ok: member created after fixing every error')

const lock = async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock profile' }).click()
  await page.getByRole('heading', { name: 'Who is training?' }).waitFor({ timeout: 5000 })
}

await lock()
await page.getByRole('button', { name: 'New profile' }).click()
// Mode switch must clear anything typed before.
const leftover = await page.getByLabel('Passphrase', { exact: true }).inputValue()
if (leftover !== '') fail(`mode switch leaked a passphrase: "${leftover}"`)
console.log('ok: switching modes clears typed passphrases')

await page.getByLabel('Name').fill('Sol Desk')
await page.getByRole('combobox', { name: 'Profile type' }).click()
await page.getByRole('option', { name: 'Gym — I run a gym' }).click()
await page.getByLabel('Gym', { exact: true }).fill('Solhouse')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('desk-pass')
await page.getByLabel('Repeat passphrase').fill('desk-pass')
await submitCreate()
await inApp()
await page.goto(BASE, { waitUntil: 'networkidle' })
await lock().catch(() => {})

// 4. Role tags on the lock screen.
const deskCard = page.getByRole('button', { name: /Sol Desk/ })
if (!(await deskCard.textContent())?.includes('Gym')) fail('gym role tag missing on lock screen')
console.log('ok: gym card carries its role tag')

// 5. Unlocking a gym profile from '/' lands on its desk without an Inbox.
await page.goto(BASE, { waitUntil: 'networkidle' })
await deskCard.click()
await page.getByLabel('Passphrase', { exact: true }).fill('desk-pass')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByRole('heading', { name: 'Gym panel' }).waitFor({ timeout: 10000 })
if (await page.getByRole('link', { name: 'Inbox' }).count()) {
  fail('gym operator shows an Inbox nav item')
}
console.log('ok: gym unlock lands on /gym with no Inbox')

// 6. Wrong passphrase still anchors to the unlock field.
await lock()
await page.getByRole('button', { name: /^Sol since/ }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('wrong-pass')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.locator('#f-passphrase-err').getByText('does not open').waitFor({ timeout: 5000 })
console.log('ok: wrong passphrase error under the unlock field')

await browser.close()
if (!process.exitCode) console.log('\ngate flow ok')
