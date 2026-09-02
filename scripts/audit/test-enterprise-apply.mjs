/**
 * The third column, end to end.
 *
 * Two things worth checking and one of them is a trap. The page must offer
 * three plans and its own arithmetic must add up — a saving a reader can check
 * is the whole point of stating one. And `gym_applications.plan` was `max: 8`,
 * which fits "base" and "plus" and refuses "enterprise" by two characters: the
 * form would have looked fine and the application would have been rejected by
 * the server with nobody the wiser.
 *
 *   node scripts/audit/test-enterprise-apply.mjs
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
  const { create } = door(page, BASE)

  console.log('\nthe page’s own arithmetic')
  await page.goto(`${BASE}/for-gyms`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  const copy = await page.textContent('body')
  /* The page, not the hero: the hero carried a price line under its CTAs
     until the layout pass took it out, and the plans section says it better. */
  check('the page names all three prices',
    ['€200', '€300', '€1,000'].every((p) => copy.includes(p)), true)
  /* Stated so a reader can check it, which means it has to survive checking. */
  check('the saving is stated', copy.includes('€500 less'), true)
  check('against a total the page also states', copy.includes('€1,500 a month'), true)
  check('and says what else that money buys', copy.includes('five gyms on Base would cost'), true)
  /* An invariant rather than a fixed sentence. Building the second-to-last
     Coming feature once left this reading "the one marked Coming are not
     built yet", and the last one left the list entirely, which took the
     sentence with it. So: the explanation appears exactly when something is
     marked Coming, and agrees in number when it does. That keeps the guard
     alive for the next feature listed before it works. */
  const marked = (copy.match(/\bComing\b/g) || []).length
  const flat = copy.replace(/\s+/g, ' ')
  check('the Coming explanation appears only when something is Coming',
    /Everything above is built/.test(flat), marked > 0)
  check('and agrees with itself in number',
    marked === 1 ? /the one marked Coming\. It is/.test(flat) : true, true)
  check('nothing still claims there are two plans',
    /two plans/i.test(copy), false)

  console.log('\nthe form')
  /* The door lives on the member landing; `/for-gyms` has its own panel with
     its own label, and the shared helper knows the first one. */
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Root', 'root-pass')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('desk@chain.test')
  await page.getByLabel('Password', { exact: true }).fill('chain-account-1')
  await page.getByLabel('Repeat password').fill('chain-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)

  await page.goto(`${BASE}/for-gyms`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const ent = page.getByRole('button', { name: /^Enterprise, / })
  check('the form offers Enterprise', (await ent.count()) > 0, true)
  await ent.click()
  await page.getByLabel('Gym name').fill('Cadena Hierro')
  await page.getByLabel('Who we reply to').fill('Rosalía Pardiñas')
  await page.getByLabel('Email', { exact: true }).last().fill('rosalia@chain.test')
  await page.getByRole('button', { name: /Send the application/ }).click()
  await page.getByText(/We have it\./).first().waitFor({ timeout: 15000 })

  console.log('\nwhat reached the server')
  const rows = (await pb.api('GET', '/api/collections/gym_applications/records', undefined, pb.su))
    .json.items ?? []
  /* The trap: `plan` was `max: 8` and "enterprise" is ten characters. */
  check('the application was stored', rows.length, 1)
  check('with the word, not a code the desk has to decode', rows[0]?.plan, 'enterprise')

  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
