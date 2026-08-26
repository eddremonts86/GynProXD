/**
 * Banner + menu proof: a gym publishes a banner targeted at ONE member and
 * only that member sees it; dismissal is personal and sticks; the standing
 * menu saves from the sample, members browse it at /menu, and promoting it
 * raises a banner that links there. Cross-gym members see none of it.
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
const gate = () => page.getByRole('heading', { name: 'Who is training?' })

const lock = async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock profile' }).click()
  await gate().waitFor({ timeout: 5000 })
}

const create = async (name, pass, { role, gym } = {}) => {
  if (await gate().isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'New profile' }).click()
  }
  await page.getByLabel('Name').fill(name)
  if (role) {
    await page.getByRole('combobox', { name: 'Profile type' }).click()
    await page.getByRole('option', { name: role }).click()
  }
  if (gym) {
    await page.getByLabel('Gym', { exact: true }).fill(gym)
    await page.getByRole('option').first().click()
  }
  await page.getByLabel('Passphrase', { exact: true }).fill(pass)
  await page.getByLabel('Repeat passphrase').fill(pass)
  await page.getByRole('button', { name: 'Create profile' }).click()
  await inApp()
}

const unlock = async (cardName, pass) => {
  await page.getByRole('button', { name: cardName }).click()
  await page.getByLabel('Passphrase', { exact: true }).fill(pass)
  await page.getByRole('button', { name: 'Unlock' }).click()
  await inApp()
}

// Cast: two members of Copper Works, one outsider, one operator.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Create your profile' }).waitFor({ timeout: 5000 })
await page.getByLabel('Name').fill('Iris')
await page.getByLabel('Gym', { exact: true }).fill('Copper Works')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('iris-pass')
await page.getByLabel('Repeat passphrase').fill('iris-pass')
await page.getByRole('button', { name: 'Create profile' }).click()
await inApp()
await lock()
await create('Bram', 'bram-pass', { gym: 'Copper Works' })
await lock()
await create('Outsider', 'out-pass', { gym: 'Elsewhere Gym' })
await lock()
await create('Copper Desk', 'desk-pass', { role: 'Gym — I run a gym', gym: 'Copper Works' })
console.log('ok: cast created')

// 1. Operator saves the sample menu and promotes it as a banner.
await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Load the sample menu' }).click()
await page.getByRole('button', { name: 'Save menu' }).click()
await page.getByText('Menu saved.').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'Promote as banner' }).click()
await page.getByText('Menu promoted').waitFor({ timeout: 5000 })
console.log('ok: menu saved from sample and promoted')

// 2. A banner targeted at Iris alone.
await page.getByLabel('Title').fill('Iris — your comp day pass is ready')
await page.getByRole('button', { name: /^Iris$/ }).click()
await page.getByRole('switch', { name: 'Show as a banner' }).click()
await page.getByRole('button', { name: 'Publish' }).click()
await page.getByText('Published to 1 member.').waitFor({ timeout: 5000 })
console.log('ok: personally targeted banner published')

// 3. Iris sees both banners (targeted first), menu link works, dismiss sticks.
await lock()
await unlock('Iris', 'iris-pass')
const strip = page.getByRole('status')
await strip.getByText('Iris — your comp day pass is ready').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'Dismiss announcement' }).click()
await strip.getByText('The kitchen at Copper Works is open').waitFor({ timeout: 5000 })
await page.getByRole('link', { name: 'See the menu' }).click()
await page.getByRole('heading', { name: 'The kitchen at Copper Works' }).waitFor({ timeout: 5000 })
await page.getByText('Grilled chicken bowl').first().waitFor({ timeout: 5000 })
await page.reload({ waitUntil: 'networkidle' })
if (await strip.getByText('comp day pass').isVisible().catch(() => false)) {
  fail('dismissed banner came back after reload')
}
console.log('ok: Iris saw both banners, dismissal stuck, menu rendered')

// 4. Bram (same gym) sees the menu banner but never the personal one.
await lock()
await unlock('Bram', 'bram-pass')
await strip.getByText('The kitchen at Copper Works is open').waitFor({ timeout: 5000 })
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

await browser.close()
if (!process.exitCode) console.log('\nbanner + menu flow ok')
