/**
 * The open door, through the app rather than the API.
 *
 * `open-door-boundary.mjs` proves the rules from the receiving side and cannot
 * see a screen. This walks the two surfaces a person actually touches: the
 * operator's reach picker, which must never offer a list of names, and the
 * member's switch, which must actually stop the messages.
 *
 *   node scripts/audit/test-open-door.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a dev
 * server; point at it with BASE_URL.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

const pb = await startSandbox()
const browser = await chromium.launch()

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const { create, unlock, lock, promote } = door(page, BASE)

  console.log('\ncast')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Root', 'root-pass')
  await lock()
  /* No gym: the audience this whole feature is about. */
  await create('Nadie', 'nadie-pass')
  await lock()
  await create('Hierro Desk', 'desk-pass', { gym: 'Hierro Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Hierro Desk', 'Gym')
  await lock()
  await unlock('Hierro Desk', 'desk-pass')
  console.log('  ok    an operator and somebody with no gym')

  console.log('\nthe gym goes Plus')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('desk@hierroviejo.test')
  await page.getByLabel('Password', { exact: true }).fill('desk-account-1')
  await page.getByLabel('Repeat password').fill('desk-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  const operator = await pb.userByEmail('desk@hierroviejo.test')
  if (!operator) throw new Error('the sync dialog did not create an account')
  await pb.api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [operator.id] }, pb.su)
  console.log('  ok    account opened, gym on Plus')

  console.log('\nthe reach picker')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const wide = page.getByRole('radio', { name: 'People with no gym' })
  check('Plus offers the open door', (await wide.count()) > 0, true)
  await wide.click()
  await page.getByLabel('Title').fill('First month on us')
  await page.waitForTimeout(300)
  /**
   * The invariant worth a check of its own: a gym never picks who receives one.
   * A name chip here would be a promise the send cannot keep — the audience is
   * a scope the server evaluates and the gym is never told who is in it.
   */
  check('and no names to pick from', (await page.getByRole('button', { name: /^Nadie$/ }).count()), 0)
  const body = await page.textContent('body')
  check('it says why there are none', body.includes('you cannot choose who'), true)
  check('and does not imply a location filter', body.includes('no location'), true)

  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/Published to/).first().waitFor({ timeout: 10000 })
  console.log('  ok    published')

  console.log('\nthe member with no gym')
  await lock()
  await unlock('Nadie', 'nadie-pass')
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
  await page.getByText('First month on us').first().waitFor({ timeout: 10000 }).catch(async () => {
    const store = await page.evaluate(() => {
      const raw = localStorage.getItem(
        Object.keys(localStorage).find((k) => k.includes('message')) || '',
      )
      try { return JSON.parse(raw || '{}') } catch { return raw }
    })
    console.log('  ---   store:', JSON.stringify(store).slice(0, 900))
    console.log('  ---   page:', JSON.stringify((await page.textContent('body')).slice(0, 400)))
  })
  const inbox = await page.textContent('body')
  /* Named as the gym. A stranger's offer wearing "enForma" would be untrue and
     would lend the platform's credibility to whoever paid for the tier. */
  check('it arrives over the gym’s own name', inbox.includes('Hierro Viejo'), true)

  console.log('\nand the switch')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  const toggle = page.getByRole('switch', { name: 'Let gyms you have not joined send you offers' })
  check('somebody with no gym is offered the switch', (await toggle.count()) > 0, true)
  await toggle.click()
  await page.waitForTimeout(400)
  await page.goto(`${BASE}/inbox`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  check('turning it off empties the recruiting out of the inbox',
    (await page.textContent('body')).includes('First month on us'), false)

  console.log('\nand the operator, who has no gym of their own')
  await lock()
  await unlock('Hierro Desk', 'desk-account-1')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  check('is not offered a switch about being recruited',
    (await page.getByRole('switch', { name: 'Let gyms you have not joined send you offers' }).count()), 0)

  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
