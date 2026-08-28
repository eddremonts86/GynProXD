/**
 * saas-review walker: visits every route in three roles (gym, admin, member),
 * captures screenshots (desktop light/dark + mobile 375), console errors,
 * failed requests and horizontal overflow, and writes a JSON summary.
 *
 * Evidence lands in docs/ui-audit/evidence/ (gitignored). The dev server must
 * already be running on http://localhost:3015 (`pnpm dev`).
 *
 *   node scripts/audit/saas-review-walk.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const BASE = process.env.WALK_BASE ?? 'http://localhost:3015'
const EVID = new URL('../../docs/ui-audit/evidence/', import.meta.url).pathname
const PASS = 'walk1234'

const report = { startedAt: new Date().toISOString(), base: BASE, shots: [], gaps: [] }
let shotIndex = 0

/** Per-navigation buckets the page listeners write into. */
let bucket = null
function freshBucket(label) {
  bucket = { label, console: [], pageErrors: [], failures: [] }
  return bucket
}

function wirePage(page) {
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    const text = msg.text()
    if (text.includes('[vite]') || text.includes('React DevTools')) return
    bucket?.console.push({ type, text: text.slice(0, 400) })
  })
  page.on('pageerror', (err) => bucket?.pageErrors.push(String(err).slice(0, 400)))
  page.on('response', (res) => {
    if (res.status() >= 400) bucket?.failures.push({ status: res.status(), url: res.url() })
  })
}

async function overflowPx(page) {
  return page.evaluate(() => {
    const el = document.documentElement
    return Math.max(0, el.scrollWidth - el.clientWidth)
  })
}

async function shoot(page, label, { path = null, ms = null } = {}) {
  shotIndex += 1
  const file = `${String(shotIndex).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: EVID + file, fullPage: true })
  report.shots.push({
    file,
    label,
    path,
    ms,
    overflowPx: await overflowPx(page),
    console: bucket?.console ?? [],
    pageErrors: bucket?.pageErrors ?? [],
    failures: bucket?.failures ?? [],
  })
  console.log(`  shot ${file}${ms != null ? ` (${ms}ms)` : ''}`)
}

async function visit(page, path, label, settle = 900) {
  freshBucket(label)
  const t0 = Date.now()
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 30_000 })
  await page.waitForTimeout(settle)
  return Date.now() - t0
}

async function gap(what, err) {
  const text = `${what}: ${String(err).slice(0, 200)}`
  report.gaps.push(text)
  console.log(`  GAP ${text}`)
}

/** Create a profile from the gate's create form. Assumes the form is visible. */
async function createProfile(page, { name, role, gym }) {
  await page.fill('#f-name', name)
  if (role !== 'member') {
    // FormSelect trigger shows the current option's label.
    await page.getByText('Member — I train here').first().click()
    const optionLabel = role === 'gym' ? 'Gym — I run a gym' : 'Administrator — I manage this device'
    await page.getByRole('option', { name: optionLabel }).click()
  }
  if (gym) {
    await page.fill('#f-gym', gym)
    await page.waitForTimeout(300)
    // Pick the matching item (or the "Add gym" creator) so blur cannot wipe it.
    const item = page.getByRole('option').filter({ hasText: gym }).first()
    if (await item.isVisible().catch(() => false)) await item.click()
    else await page.keyboard.press('Escape')
  }
  await page.fill('#f-passphrase', PASS)
  await page.fill('#f-repeat-passphrase', PASS)
  await page.getByRole('button', { name: 'Create profile' }).click()
  await page.waitForTimeout(1200)
}

/** Lock the active profile from Settings and land back on the gate. */
async function lockProfile(page) {
  await page.goto(BASE + '/settings', { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: /lock/i }).first().click()
  await page.waitForTimeout(800)
}

/** From the unlock gate, open the create form. */
async function gateToCreate(page) {
  await page.getByRole('button', { name: /new profile/i }).click()
  await page.waitForTimeout(300)
}

const MEMBER_ROUTES = [
  ['/', 'today'],
  ['/planner', 'planner'],
  ['/challenges', 'challenges'],
  ['/story', 'story'],
  ['/library', 'library'],
  ['/history', 'history'],
  ['/settings', 'settings'],
  ['/inbox', 'inbox'],
  ['/menu', 'menu'],
  ['/fitness-test', 'fitness-test'],
  ['/onboarding', 'onboarding'],
  ['/generated/does-not-exist', 'generated-bad-id'],
  ['/no-such-route', 'not-found'],
  ['/gym', 'gym-as-member'],
  ['/admin', 'admin-as-member'],
]

const DARK_ROUTES = ['/', '/planner', '/library', '/history', '/settings', '/inbox', '/story', '/challenges']
const MOBILE_ROUTES = [
  '/',
  '/planner',
  '/library',
  '/history',
  '/settings',
  '/story',
  '/challenges',
  '/menu',
  '/inbox',
  '/fitness-test',
  '/onboarding',
]

async function main() {
  await mkdir(EVID, { recursive: true })
  const browser = await chromium.launch()

  // ---- Context A: shared device — gym publishes, admin manages, member trains
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  wirePage(page)

  console.log('gate (first run)')
  const ms0 = await visit(page, '/', 'gate-first-run')
  await shoot(page, 'gate-first-run', { path: '/', ms: ms0 })
  try {
    await page.getByRole('button', { name: 'Create profile' }).click()
    await page.waitForTimeout(300)
    await shoot(page, 'gate-validation-empty-name', { path: '/' })
  } catch (e) {
    await gap('gate validation shot', e)
  }

  console.log('gym operator')
  try {
    await createProfile(page, { name: 'Iron Boss', role: 'gym', gym: 'Iron House' })
    freshBucket('gym-panel')
    await page.waitForTimeout(600)
    await shoot(page, 'gym-panel-compose', { path: '/gym' })
    // Publish one announcement so the member inbox has content.
    await page.getByLabel('Title').fill('Open day Saturday')
    await page
      .getByLabel('Message')
      .fill('Doors open at 10:00. Bring a friend, the coffee is on the house.')
    await page.getByRole('button', { name: /publish/i }).click()
    await page.waitForTimeout(700)
    await shoot(page, 'gym-panel-published', { path: '/gym' })
    for (const tab of ['Sent', 'Menu', 'Members']) {
      try {
        await page.getByRole('tab', { name: tab }).click()
        await page.waitForTimeout(500)
        await shoot(page, `gym-panel-${tab.toLowerCase()}`, { path: '/gym' })
      } catch (e) {
        await gap(`gym tab ${tab}`, e)
      }
    }
  } catch (e) {
    await gap('gym fixture', e)
  }

  console.log('admin')
  try {
    await lockProfile(page)
    await shoot(page, 'gate-unlock-list', { path: '/' })
    await gateToCreate(page)
    await createProfile(page, { name: 'Root Admin', role: 'admin' })
    // Creation returns to the route it started from, so land on the panel explicitly.
    const msAdmin = await visit(page, '/admin', 'admin-panel')
    await shoot(page, 'admin-panel', { path: '/admin', ms: msAdmin })
  } catch (e) {
    await gap('admin fixture', e)
  }

  console.log('member (Iron House)')
  try {
    await lockProfile(page)
    await gateToCreate(page)
    await createProfile(page, { name: 'Jorge', role: 'member', gym: 'Iron House' })
  } catch (e) {
    await gap('member fixture', e)
  }

  for (const [path, label] of MEMBER_ROUTES) {
    try {
      const ms = await visit(page, path, label, path === '/' ? 1500 : 900)
      await shoot(page, label, { path, ms })
    } catch (e) {
      await gap(`route ${path}`, e)
    }
  }

  // Onboarding estimate card (no AI call: structured fields only).
  try {
    await visit(page, '/onboarding', 'onboarding-estimate')
    for (const [labelText, value] of [
      ['Age', '40'],
      ['Height', '178'],
      ['Current weight', '100'],
      ['Target weight', '80'],
    ]) {
      await page.getByLabel(labelText, { exact: false }).first().fill(value)
    }
    await page.waitForTimeout(700)
    await shoot(page, 'onboarding-estimate', { path: '/onboarding' })
  } catch (e) {
    await gap('onboarding estimate', e)
  }

  console.log('dark pass')
  try {
    await page.evaluate(() => localStorage.setItem('forma-theme', 'dark'))
    for (const path of DARK_ROUTES) {
      const label = `${path === '/' ? 'today' : path.slice(1)}-dark`
      try {
        const ms = await visit(page, path, label)
        await shoot(page, label, { path, ms })
      } catch (e) {
        await gap(`dark ${path}`, e)
      }
    }
    await page.evaluate(() => localStorage.setItem('forma-theme', 'light'))
  } catch (e) {
    await gap('dark pass', e)
  }

  console.log('mobile pass (375x812)')
  await page.setViewportSize({ width: 375, height: 812 })
  for (const path of MOBILE_ROUTES) {
    const label = `${path === '/' ? 'today' : path.slice(1).replace(/\//g, '-')}-mobile`
    try {
      const ms = await visit(page, path, label)
      await shoot(page, label, { path, ms })
    } catch (e) {
      await gap(`mobile ${path}`, e)
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 })

  await ctx.close()

  // ---- Context B: solo member (fresh storage) — bump/empty states
  console.log('solo member (fresh device)')
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page2 = await ctx2.newPage()
  wirePage(page2)
  try {
    await visit(page2, '/', 'solo-gate')
    await createProfile(page2, { name: 'Solo Sam', role: 'member' })
    for (const [path, label] of [
      ['/inbox', 'solo-inbox-bump'],
      ['/menu', 'solo-menu-empty'],
      ['/', 'solo-today-empty'],
    ]) {
      const ms = await visit(page2, path, label)
      await shoot(page2, label, { path, ms })
    }
  } catch (e) {
    await gap('solo fixture', e)
  }
  await ctx2.close()

  await browser.close()
  report.finishedAt = new Date().toISOString()
  await writeFile(EVID + 'walk.json', JSON.stringify(report, null, 2))

  const errors = report.shots.filter(
    (s) => s.console.length > 0 || s.pageErrors.length > 0 || s.failures.length > 0,
  )
  console.log(`\n${report.shots.length} shots, ${report.gaps.length} gaps, ${errors.length} shots with console/network noise`)
  for (const s of errors) {
    console.log(`  ${s.file}: ${JSON.stringify({ console: s.console, pageErrors: s.pageErrors, failures: s.failures }).slice(0, 300)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
