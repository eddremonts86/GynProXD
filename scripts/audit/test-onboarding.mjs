/**
 * End-to-end smoke test of the plan flow: describe a situation in free text,
 * fill the form from it, generate a programme, and copy it into the planner.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
const page = await ctx.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })

await page
  .locator('textarea')
  .fill('male, 40 years old, 140kg, want to get down to 80kg, gym 3 times a week for 2 hours')
await page.getByRole('button', { name: 'Fill the form' }).click()
await page.waitForTimeout(300)

if ((await page.locator('input#f-current-weight').inputValue()) !== '140') {
  fail('free text did not populate the form')
}
if (!(await page.textContent('body'))?.includes('Realistic timeline')) {
  fail('estimate panel missing')
}
console.log('ok: free text parsed and estimate shown')

await page.getByRole('button', { name: 'Generate plan' }).click()
await page.waitForURL(/\/generated\/.+/, { timeout: 5000 })
// The route is lazy, so wait for its content rather than the navigation alone.
await page
  .getByRole('heading', { name: /^Week 1$/ })
  .waitFor({ timeout: 5000 })
  .catch(() => fail('generated calendar missing'))
console.log('ok: programme generated at', page.url())

await page.getByRole('button', { name: 'Copy to planner' }).first().click()
await page.waitForURL(/\/planner$/, { timeout: 5000 })
await page
  .getByRole('button', { name: /^Monday, \d+ movements?$/ })
  .waitFor({ timeout: 5000 })
  .catch(() => fail('planner did not receive the plan'))
console.log('ok: copied into the planner')

if (errors.length > 0) {
  console.error(`FAIL ${errors.length} console errors:`)
  for (const e of errors.slice(0, 5)) console.error(`  ${e}`)
  process.exitCode = 1
}

await browser.close()
if (!process.exitCode) console.log('\nplan flow ok')
