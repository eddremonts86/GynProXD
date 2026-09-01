/**
 * Banner + menu proof: a gym publishes a banner targeted at ONE member and
 * only that member sees it; dismissal is personal and sticks; the standing
 * menu saves from the sample, members browse it at /menu, and promoting it
 * raises a banner that links there. Cross-gym members see none of it.
 *
 * The kitchen is a Plus feature now, and a plan is a fact the sync server holds
 * — a gym that lives only on this device reads as Base and is shown no Menu tab
 * at all. So this walk boots a throwaway PocketBase, opens a real sync account
 * through the app's own dialog, and puts that account behind a `plan: 'plus'`
 * gym. Dropping the kitchen half instead would have left a walk called "banner
 * + menu" that no longer went near a menu.
 *
 *   node scripts/audit/test-banner-menu.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

const pb = await startSandbox()
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const { create, unlock, lock, promote } = door(page, BASE)

  // Cast: an administrator, two members of Copper Works, an outsider, an operator.
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Root', 'root-pass')
  await lock()
  await create('Iris', 'iris-pass', { gym: 'Copper Works' })
  await lock()
  await create('Bram', 'bram-pass', { gym: 'Copper Works' })
  await lock()
  await create('Outsider', 'out-pass', { gym: 'Elsewhere Gym' })
  await lock()
  await create('Copper Desk', 'desk-pass', { gym: 'Copper Works' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Copper Desk', 'Gym')
  await lock()
  await unlock('Copper Desk', 'desk-pass')
  console.log('ok: cast created')

  // 0. The operator's account, and the Plus gym it stands behind.
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('desk@copperworks.test')
  await page.getByLabel('Password', { exact: true }).fill('desk-account-1')
  await page.getByLabel('Repeat password').fill('desk-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)

  const operator = await pb.userByEmail('desk@copperworks.test')
  if (!operator) throw new Error('the sync dialog did not create an account')
  const gym = (
    await pb.api('POST', '/api/collections/gyms/records',
      { name: 'Copper Works', kind: 'gym', plan: 'plus', operators: [operator.id] }, pb.su)
  ).json
  if (gym.plan !== 'plus') fail('the sandbox gym is not on Plus')
  console.log('ok: operator account opened, gym put on Plus')

  // 1. Operator saves the sample menu and promotes it as a banner.
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const menuTab = page.getByRole('tab', { name: /^Menu/ })
  if ((await menuTab.count()) === 0) {
    fail('Plus gym was shown no Menu tab — the plan did not reach the panel')
    throw new Error('no Menu tab')
  }
  await menuTab.click()
  await page.getByRole('button', { name: 'Load the sample menu' }).click()
  await page.getByRole('button', { name: 'Save menu' }).click()
  /* "Menu saved on this device…", then either "…and sent to your members." or a
     line saying it has not. Matched on the part that is true either way: this
     walk is about banners and menus, not about whether the bus was reachable. */
  await page.getByText(/Menu saved/).first().waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Promote as banner' }).click()
  await page.getByText(/Menu promoted/).first().waitFor({ timeout: 10000 })
  console.log('ok: menu saved from sample and promoted')

  // 2. A banner targeted at Iris alone.
  await page.getByRole('tab', { name: /^Compose/ }).click()
  await page.getByLabel('Title').fill('Iris — your comp day pass is ready')
  await page.getByRole('button', { name: /^Iris$/ }).click()
  await page.getByRole('switch', { name: 'Show as a banner' }).click()
  await page.getByRole('button', { name: 'Publish' }).click()
  /* An operator with an account gets "Published to Copper Works on every
     device", not a headcount — the row went to the bus, so the panel names the
     gym rather than who happened to be on this device. The targeting itself is
     proven below, by who does and does not see it. */
  await page.getByText(/Published to/).first().waitFor({ timeout: 10000 })
  console.log('ok: personally targeted banner published')

  // 3. Iris sees both banners (targeted first), menu link works, dismiss sticks.
  await lock()
  await unlock('Iris', 'iris-pass')
  const strip = page.getByRole('status')
  await strip.getByText('Iris — your comp day pass is ready').waitFor({ timeout: 10000 })
  await page.getByRole('button', { name: 'Dismiss announcement' }).click()
  await strip.getByText('The kitchen at Copper Works is open').waitFor({ timeout: 10000 })
  await page.getByRole('link', { name: 'See the menu' }).click()
  await page.getByRole('heading', { name: 'The kitchen at Copper Works' }).waitFor({ timeout: 10000 })
  await page.getByText('Grilled chicken bowl').first().waitFor({ timeout: 10000 })
  await page.reload({ waitUntil: 'networkidle' })
  if (await strip.getByText('comp day pass').isVisible().catch(() => false)) {
    fail('dismissed banner came back after reload')
  }
  console.log('ok: Iris saw both banners, dismissal stuck, menu rendered')

  // 4. Bram (same gym) sees the menu banner but never the personal one.
  await lock()
  await unlock('Bram', 'bram-pass')
  await strip.getByText('The kitchen at Copper Works is open').waitFor({ timeout: 10000 })
  if ((await page.getByRole('status').textContent())?.includes('comp day pass')) {
    fail('personally targeted banner leaked to another member')
  }
  console.log('ok: personal targeting held inside the gym')

  // 5. The outsider sees no banner and no foreign menu.
  await lock()
  await unlock('Outsider', 'out-pass')
  if (await page.getByRole('status').isVisible().catch(() => false)) {
    fail('banner leaked across gyms')
  }
  await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' })
  if (!(await page.textContent('body'))?.includes('has not published a menu yet')) {
    fail('outsider sees a foreign menu')
  }
  console.log('ok: nothing crosses gyms — banners or menus')
} finally {
  await browser.close()
  await pb.stop()
}

if (!process.exitCode) console.log('\nbanner + menu flow ok')
