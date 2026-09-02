/**
 * End-to-end smoke of the training loop: start an empty session, add a
 * movement, log a set, finish, and find it in History. Runs on a clean
 * profile so empty states get exercised too.
 */
import { chromium } from 'playwright'
import { ensureProfile, watchConsole } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
const page = await ctx.newPage()
await ensureProfile(page, BASE)

const errors = watchConsole(page)

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })

await page.getByRole('button', { name: 'Start an empty session' }).click()
await page.getByRole('button', { name: 'Add movement' }).click()
await page.getByLabel('Search movements').fill('barbell full squat')
await page.getByRole('button', { name: /Barbell Full Squat/ }).first().click()

// The focus card prefills; nudge weight up once with a real pointer press.
await page.getByRole('button', { name: 'Increase Weight' }).click()
const weight = await page.getByLabel('Weight', { exact: true }).inputValue()
if (!(Number(weight) > 0)) fail(`weight did not prefill or step (got "${weight}")`)

await page.getByRole('button', { name: 'Log set' }).click()
/* The logged row itself, rather than the header tally. That tally reads "1 set"
   to a person and "1sets" to `textContent`, because the number and its label are
   separate nodes — so the old check searched the page for a string the DOM has
   never contained, and failed on a set that was logged correctly. */
await page
  .getByText(/^Set 1$/)
  .first()
  .waitFor({ timeout: 5000 })
  .catch(() => fail('logged set not reflected'))

// Rest countdown appears after a straight set.
await page
  .getByRole('progressbar', { name: 'Rest remaining' })
  .waitFor({ timeout: 5000 })
  .catch(() => fail('rest countdown missing'))
console.log('ok: set logged with rest running')

await page.getByRole('button', { name: 'Finish' }).click()
await page.getByRole('heading', { name: 'Today' }).waitFor({ timeout: 5000 })

await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
// Session rows are collapsed; the movement names live behind the expander.
await page.getByRole('button', { expanded: false }).first().click()
await page.getByText('Barbell Full Squat').first().waitFor({ timeout: 3000 })
if (!(await page.textContent('body'))?.includes('Sessions')) fail('history totals missing')
console.log('ok: session landed in History with its set')

if (errors.length > 0) {
  console.error(`FAIL ${errors.length} console errors:`)
  for (const e of errors.slice(0, 5)) console.error(`  ${e}`)
  process.exitCode = 1
}

await browser.close()
if (!process.exitCode) console.log('\nsession flow ok')
