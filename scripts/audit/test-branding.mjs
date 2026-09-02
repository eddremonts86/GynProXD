/**
 * A gym's colour, on the member's screen, measured off the painted pixels.
 *
 * `branding-boundary.mjs` proves who may set it. This asks the harder question:
 * once set, is the result legible — and does the colour stay on the gym's own
 * surfaces rather than spreading into the app around them?
 *
 * Two colours are used on purpose. A deep navy that either ink can carry, and
 * steel blue #4682b4, which sits in the band where neither black nor white
 * clears 4.5:1 — a band full of ordinary gym colours. The second must fall back
 * rather than render words nobody can read.
 *
 *   node scripts/audit/test-branding.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a dev
 * server; point at it with BASE_URL.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const NEEDED = 4.5

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

/**
 * Contrast of the banner as the browser actually painted it.
 *
 * A real function rather than a string handed to `evaluate`: the string form
 * silently returned nothing here, and cost three runs to place — the element
 * was on the page the whole time.
 *
 * Found by its own text rather than by `[role=status]`, because several things
 * on this screen carry that role.
 */
function measureBanner() {
  const strips = Array.from(document.querySelectorAll('[role="status"]'))
  const strip = strips.find((el) => (el.textContent || '').includes('kitchen is open'))
  if (!strip) return null
  const style = getComputedStyle(strip)
  const parse = (v) => (String(v).match(/[\d.]+/g) || []).slice(0, 3).map(Number)
  const lum = (rgb) => {
    const ch = rgb.map((v) => {
      const t = v / 255
      return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
  }
  const bg = parse(style.backgroundColor)
  const fg = parse(style.color)
  if (bg.length < 3 || fg.length < 3) return null
  const a = lum(bg)
  const b = lum(fg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return {
    bg: bg.join(','),
    fg: fg.join(','),
    ratio: Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100,
  }
}

/** Opens a sync account for the profile that is currently unlocked. */
async function openAccount(page, email, password, server) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Repeat password').fill(password)
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(server)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
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
  await create('Ana', 'ana-pass', { gym: 'Hierro Viejo' })
  await lock()
  await create('Hierro Desk', 'desk-pass', { gym: 'Hierro Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Hierro Desk', 'Gym')
  await lock()
  await unlock('Hierro Desk', 'desk-pass')

  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('desk@hierro.test')
  await page.getByLabel('Password', { exact: true }).fill('desk-account-1')
  await page.getByLabel('Repeat password').fill('desk-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  const op = await pb.userByEmail('desk@hierro.test')
  if (!op) throw new Error('the sync dialog did not create an account')
  const gym = (await pb.api('POST', '/api/collections/gyms/records',
    { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [op.id], owner: op.id }, pb.su)).json
  console.log('  ok    a Plus gym with an owner at the desk')

  console.log('\nthe panel')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Members/ }).click()
  await page.waitForTimeout(1500)
  await page.getByLabel('Hex').fill('#1e3a5f')
  await page.waitForTimeout(400)
  const preview = await page.textContent('body')
  check('a colour that can carry words shows the words',
    preview.includes('The kitchen is open until two'), true)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText(/Saved\./).first().waitFor({ timeout: 10000 })

  /* The band neither ink clears. The panel must say so rather than preview
     something illegible. */
  await page.getByLabel('Hex').fill('#4682b4')
  await page.waitForTimeout(400)
  const awkward = await page.textContent('body')
  check('and one that cannot says so, in words', awkward.includes('would not be legible'), true)
  check('without previewing words on it',
    awkward.includes('The kitchen is open until two'), false)

  console.log('\nwhat the member sees')
  /* The navy was saved above and the server still holds it — the field is only
     holding the unsaved steel blue. Asking to save the navy again would find
     Save correctly disabled, which is how the first version of this walk
     failed: it wanted a state that already held. */
  await page.getByRole('tab', { name: /^Compose/ }).click()
  await page.getByLabel('Title').fill('The kitchen is open until two')
  await page.getByRole('switch', { name: 'Show as a banner' }).click()
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/Published to/).first().waitFor({ timeout: 10000 })

  /**
   * Ana needs an account of her own.
   *
   * The colour is read off the gym's row, and a device with no sync account
   * cannot ask — so a member without one sees the app's own colour, honestly,
   * because there is nowhere the answer could come from. The first version of
   * this walk used such a member and measured no paint at all. A gym paying for
   * its colour has members on accounts; that is the case worth checking.
   */
  await lock()
  await unlock('Ana', 'ana-pass')
  await pb.api('POST', '/api/collections/gym_secrets/records', { gym: gym.id, code: 'HIERRO-1' }, pb.su)
  await openAccount(page, 'ana@hierro.test', 'ana-account-1', pb.base)

  /**
   * Joined through the app, with the code, because that is what membership is.
   *
   * A gym name typed at the door is a claim, not a membership: the first sync
   * takes the server as the truth, clears the local name and files a join
   * request for the gym that was named. Deliberate, and documented where it
   * happens. An earlier version of this walk joined over the API and then
   * wondered why the banner never arrived — the account had a membership the
   * device had not been told about.
   */
  void 0
  /* Opening the account filed that request. The gym approves it, which is the
     whole point of the bridge, and is what makes the membership real. */
  await lock()
  await unlock('Hierro Desk', 'desk-account-1')
  await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Requests/ }).click()
  await page.getByRole('button', { name: 'Approve' }).first().waitFor({ timeout: 15000 })
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await page.waitForTimeout(1500)

  await lock()
  await unlock('Ana', 'ana-account-1')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForTimeout(3500)
  const painted = await page.evaluate(measureBanner)
  if (!painted) {
    console.log('  ---   role=status elements:', JSON.stringify(await page.evaluate(
      () => [...document.querySelectorAll('[role="status"]')].map((e) => e.textContent.slice(0, 60)))))
    console.log('  ---   inbox has it:', (await page.textContent('body')).includes('kitchen is open'))
    console.log('  ---   url:', page.url())
    console.log('  ---   body:', JSON.stringify((await page.textContent('body')).slice(0, 400)))
  }
  check('the banner is painted in the gym’s colour', painted?.bg, '30,58,95')
  /* The whole reason the ink is chosen rather than fixed. */
  check(`and its words clear ${NEEDED}:1 as rendered`, (painted?.ratio ?? 0) >= NEEDED, true)
  console.log(`  ---   measured ${painted?.ratio}:1 with ink rgb(${painted?.fg})`)

  console.log('\nand where it must not reach')
  const chrome = await page.evaluate(() => {
    const nav = document.querySelector('a[aria-label="enForma, go to today"]')
    const shell = nav?.closest('header, nav, aside') ?? document.body
    return getComputedStyle(shell).backgroundColor
  })
  /* The shell is where a member reads whose app holds their training. A shell
     wearing the gym would tell them, plausibly and wrongly, that the gym does. */
  check('the app’s own chrome is untouched', chrome.includes('30, 58, 95'), false)

  check('no page errors', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
