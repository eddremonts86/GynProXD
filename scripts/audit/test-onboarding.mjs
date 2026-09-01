/**
 * End-to-end smoke test of the plan flow: describe a situation in free text,
 * fill the form from it, generate a programme, and copy it into the planner.
 */
import { chromium } from 'playwright'
import { ensureProfile } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
// The audit exercises the deterministic path; the coach has its own live test.
await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
const page = await ctx.newPage()
await ensureProfile(page, BASE)

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

/**
 * The intake is a five-step wizard now, not one long form with a textarea
 * bolted to the top. So the sentence is applied on the first step and the rest
 * of the answers are checked where they actually live — reached by walking
 * forward rather than by assuming which step holds what.
 */
await page
  .locator('textarea')
  .first()
  .fill('male, 40 years old, 140kg, want to get down to 80kg, gym 3 times a week for 2 hours')
await page.getByRole('button', { name: 'Use this and check it' }).click()
await page.waitForTimeout(300)

const next = page.getByRole('button', { name: /^(Continue|Skip and fill it in)/ })
const finish = page.getByRole('button', { name: /Design my programme/ })
/* The value as the step displays it, not the input behind it. Each answer sits
   in a collapsed row that only mounts its field once opened, so the old
   `input#f-current-weight` was not merely renamed — it is not in the DOM. What
   a person checks here is the number on the row. */
const shownWeight = page.getByText('140 kg')

let sawWeight = false
for (let step = 0; step < 10 && (await finish.count()) === 0; step++) {
  if ((await shownWeight.count()) > 0) sawWeight = true
  await next.click()
  await page.waitForTimeout(250)
}
if (!sawWeight) fail('free text did not populate the form: no step showed 140 kg')
if (!(await page.textContent('body'))?.includes('Realistic timeline')) {
  fail('estimate panel missing')
}
console.log('ok: free text parsed and estimate shown')

await finish.click()
/* The coach is off for this walk (see the init script), so this is the
   deterministic generator and quick — but the route is lazy. */
await page.waitForURL(/\/generated\/.+/, { timeout: 30000 })
// The route is lazy, so wait for its content rather than the navigation alone.
await page
  .getByRole('heading', { name: /^Week 1$/ })
  .waitFor({ timeout: 20000 })
  .catch(() => fail('generated calendar missing'))
console.log('ok: programme generated at', page.url())

/* "Edit a copy" since the two ways to change a programme were made findable;
   it was "Copy to planner", and it does the same thing — saves the generated
   programme as an editable plan and opens the planner on it. */
await page.getByRole('button', { name: 'Edit a copy' }).first().click()
await page.waitForURL(/\/planner$/, { timeout: 5000 })
await page
  .getByRole('button', { name: /^Monday \d{4}-\d{2}-\d{2}.*movements?$/ })
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
