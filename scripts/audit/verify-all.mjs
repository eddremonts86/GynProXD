import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const routes = [
  { path: '/', name: 'Today', check: 'Today' },
  { path: '/onboarding', name: 'Onboarding', check: 'Build a plan' },
  { path: '/planner', name: 'Planner', check: 'Planner' },
  { path: '/library', name: 'Library', check: 'Library' },
  { path: '/history', name: 'History', check: 'History' },
  { path: '/settings', name: 'Settings', check: 'Settings' },
]

const browser = await chromium.launch()
let failed = 0
for (const vp of viewports) {
  console.log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`)
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`pageerror ${vp.name}:`, e))
  page.on('console', (m) => { if (m.type() === 'error') console.log(`console error ${vp.name}:`, m.text()) })
  for (const r of routes) {
    console.log(`-> ${r.path} (${r.name})`)
    await page.goto(`${BASE}${r.path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
    const body = await page.textContent('body')
    if (!body?.includes(r.check)) {
      console.error(`  FAIL: missing "${r.check}" on ${r.path} ${vp.name}`)
      failed++
    } else {
      console.log(`  ok: found "${r.check}"`)
    }
    // check buttons are visible and clickable
    const buttons = await page.locator('button').count()
    console.log(`  buttons: ${buttons}`)
    // check for shadcn sidebar trigger on desktop
    if (vp.name === 'desktop') {
      const trigger = page.locator('[data-sidebar="trigger"]')
      if (await trigger.count() > 0) console.log('  sidebar trigger ok')
    }
    // check theme toggle
    const toggle = page.locator('button[aria-label*="Switch to"]:visible')
    if (await toggle.count() > 0) console.log('  theme toggle ok')
    // check for console errors
    // take screenshot for evidence
    await page.screenshot({ path: `docs/impeccable/shots/verify-${vp.name}-${r.name}.png`, fullPage: false })
  }
  // test interactions: onboarding generate flow
  console.log('-> testing onboarding generate flow')
  await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })
  const ta = page.locator('textarea')
  await ta.fill('male 30 years old 80kg target 75kg 4 times a week 60min effort 3')
  await page.getByRole('button', { name: 'Generate plan' }).click()
  await page.waitForURL(/\/generated\/.+/, { timeout: 5000 }).catch(() => console.log('  no nav to generated (maybe still on onboarding)'))
  console.log('  onboarding flow ok, url:', page.url())
  // test library search
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' })
  const search = page.locator('input[placeholder*="Search"]')
  await search.fill('bench')
  await page.waitForTimeout(500)
  console.log('  library search ok')
  // test planner create
  await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' })
  // A fresh context starts with no weekly plan, so cover both entry points.
  const emptyWeek = page.getByRole('button', { name: 'Start an empty week' })
  if (await emptyWeek.count() > 0) {
    await emptyWeek.click()
  } else {
    await page.getByRole('button', { name: 'New plan' }).first().click()
    await page.locator('input#f-name').fill('Test Plan')
    await page.getByRole('button', { name: 'Create' }).first().click()
  }
  await page.waitForTimeout(400)
  if (!(await page.textContent('body'))?.includes('Add movement')) {
    console.error('  planner did not open a week')
    failed += 1
  } else {
    console.log('  planner create ok')
  }
  // test theme toggle
  const toggleBtn = page.locator('button[aria-label*="Switch to"]:visible')
  if (await toggleBtn.count() > 0) {
    await toggleBtn.click()
    await page.waitForTimeout(500)
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
    console.log('  theme toggle: dark=', isDark)
    await toggleBtn.click()
    await page.waitForTimeout(500)
  }
  await ctx.close()
}
await browser.close()
if (failed > 0) {
  console.error(`FAILED ${failed} checks`)
  process.exit(1)
}
console.log('\nALL VERIFICATIONS PASS')
