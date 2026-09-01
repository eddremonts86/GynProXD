/**
 * Proof that a gym can hand over its training without handing over its body.
 *
 * `gym-programme.spec.ts` proves the same thing about the object the app
 * builds, and cannot see what actually left the machine. This runs the feature
 * end to end — a real PocketBase from the repo's own migrations, a real Plus
 * gym, the app's own composer — and then reads the row the server stored and
 * asks whether the operator's age, weight, targets and injuries are in it.
 *
 * The operator here is deliberately somebody with things to hide: 47, 91kg,
 * heading for 78, and a reconstructed knee. If any of that reaches a member,
 * this fails, and it fails on the evidence rather than on the intention.
 *
 *   node scripts/audit/gym-programme-boundary.mjs
 *
 * Leaves three screenshots in SHOTS: the composer, the member's card and the
 * copy they end up with. A boundary you can only read about is one nobody
 * looks at.
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a dev
 * server; point at it with BASE_URL.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const ROOT = path.resolve(import.meta.dirname, '../..')
const APP = process.env.BASE_URL ?? 'http://localhost:3015'
const SHOTS = process.env.SHOT_DIR ?? path.join(ROOT, '.audit-shots')

/** The operator's own body, as they will type it into their own planner. */
const OPERATOR_SECRETS = ['47', '91', '78', '168', 'ACL', 'reconstructed']
/**
 * The half of it safe to search for in rendered text.
 *
 * A two-digit number is in every page: week counts, dates, rep targets. Looking
 * for "78" on a screen proves nothing either way, so screens are checked for
 * the words — which are unmistakable — and for the member's own numbers being
 * the ones that are there.
 */
const OPERATOR_WORDS = ['ACL', 'reconstructed']

let failures = 0
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures += 1
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${label}` +
      (ok ? '' : `\n          want ${JSON.stringify(want)}\n          got  ${JSON.stringify(got)}`),
  )
}

await mkdir(SHOTS, { recursive: true })
const pb = await startSandbox()
const { su, api } = pb
let browser

try {
  console.log(`\nsandbox up on ${pb.base}`)

  browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 940 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const { create, unlock, lock, promote } = door(page, APP)

  /** The intake, said in a sentence and then walked to the end of the wizard. */
  const design = async (sentence) => {
    await page.goto(`${APP}/onboarding`, { waitUntil: 'networkidle' })
    await page.locator('textarea').first().fill(sentence)
    await page.getByRole('button', { name: 'Use this and check it' }).click()
    await page.waitForTimeout(400)
    const finish = page.getByRole('button', { name: /Design my programme/ })
    for (let i = 0; i < 10 && (await finish.count()) === 0; i++) {
      await page.getByRole('button', { name: /^(Continue|Skip and fill it in)/ }).click()
      await page.waitForTimeout(250)
    }
    /* The coach is tried first and falls back to the local generator only after
       its own timeout, so this is slow rather than stuck. */
    await finish.click()
    await page.waitForURL(/\/generated\/.+/, { timeout: 90000 })
    await page.getByRole('heading', { name: /^Week 1$/ }).waitFor({ timeout: 20000 })
  }

  console.log('\ncast')
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Create your profile' }).first().waitFor({ timeout: 10000 })
  /* The first profile on a device is its administrator, and roles are handed
     out from the admin panel — a gym operator cannot be self-declared at the
     door. So the cast needs somebody to do the handing out. */
  await create('Root', 'root-pass')
  console.log('  ok    the device administrator')
  await lock()
  await create('Rio', 'rio-pass', { gym: 'Hierro Viejo' })
  console.log('  ok    member Rio, of Hierro Viejo')
  await lock()
  await create('Hierro Desk', 'desk-pass', { gym: 'Hierro Viejo' })
  await lock()
  await unlock('Root', 'root-pass')
  await promote('Hierro Desk', 'Gym')
  console.log('  ok    operator Hierro Desk, promoted from the admin panel')
  await lock()
  await unlock('Hierro Desk', 'desk-pass')

  console.log('\nthe operator designs their own year')
  await design(
    'female, 47 years old, 91kg, want to get down to 78kg, 168cm, reconstructed left ACL so no deep knee flexion under load, gym 3 times a week for 1 hour',
  )
  console.log('  ok    a plan built from a body worth protecting')

  console.log('\nthe operator opens a sync account')
  await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' })
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
  check('the operator has an account on the server', !!operator, true)
  if (!operator) throw new Error('no operator account: the sync dialog did not complete')

  const gym = (
    await api('POST', '/api/collections/gyms/records',
      { name: 'Hierro Viejo', kind: 'gym', plan: 'plus', operators: [operator.id] }, su)
  ).json
  check('a Plus gym exists, with this operator behind the desk', gym.plan, 'plus')

  console.log('\nthe composer')
  await page.goto(`${APP}/gym`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const programmeTab = page.getByRole('radio', { name: 'Programme' })
  check('Plus offers the Programme template', await programmeTab.isVisible().catch(() => false), true)
  await programmeTab.click()
  await page.getByRole('radio').filter({ hasText: /12 months|3 months|6 months|1 month/ }).first().click()
  await page.getByLabel('Title').fill('Winter, knees intact')
  await page.locator('#gym-body').fill(
    'Twelve weeks of barbell work, three days a week. Written for somebody who can already squat and press with a bar and wants a winter with a plan in it.',
  )
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOTS, '1-composer.png'), fullPage: true })
  await page.getByRole('button', { name: 'Publish' }).click()
  await page.getByText(/Published to/).first().waitFor({ timeout: 10000 })
  console.log('  ok    published')

  console.log('\nwhat actually left the machine')
  const rows = await api('GET', '/api/collections/gym_messages/records?perPage=10', undefined, su)
  const row = rows.json.items?.[0]
  check('a programme row reached the server', row?.kind, 'programme')

  /**
   * An allowlist, not a search for known secrets.
   *
   * The first version of this searched the row for the operator's numbers and
   * kept hitting PocketBase's own ids and a `Date.now()` in the programme id —
   * noise, and worse, a test that would have gone quiet the day somebody added
   * a field nobody had thought to search for. So: every key that leaves is
   * named here, and anything else fails. A new field on the intake reaches a
   * member only over this list's dead body.
   */
  const ALLOWED = {
    programme: ['id', 'name', 'blurb', 'gym', 'daysPerWeek', 'minsPerSession',
                'equipment', 'level', 'duration', 'blocks', 'source'],
    block: ['days', 'label', 'place', 'intensity'],
    day: ['day', 'exercises', 'ecNote'],
    exercise: ['exerciseId', 'progression', 'supersetGroup', 'timed', 'unilateral'],
  }
  const stray = []
  const walk = (obj, allowed, where) => {
    for (const key of Object.keys(obj ?? {})) {
      if (!allowed.includes(key)) stray.push(`${where}.${key}`)
    }
  }
  const programme = row?.payload?.programme
  walk(programme, ALLOWED.programme, 'programme')
  for (const [i, block] of (programme?.blocks ?? []).entries()) {
    walk(block, ALLOWED.block, `blocks[${i}]`)
    for (const [j, day] of (block.days ?? []).entries()) {
      walk(day, ALLOWED.day, `blocks[${i}].days[${j}]`)
      for (const [k, ex] of (day.exercises ?? []).entries()) {
        walk(ex, ALLOWED.exercise, `blocks[${i}].days[${j}].exercises[${k}]`)
      }
    }
  }
  check('nothing on the wire that is not on the list', stray, [])
  check('the training is on the wire', (programme?.blocks?.length ?? 0) > 0, true)

  /**
   * And the free text, which an allowlist cannot catch.
   *
   * This is the check that earned its place. The programme used to carry the
   * designer's `coachNotes`, a field with nothing personal about it holding
   * prose that said "ACL precautions are strictly followed" — the operator's
   * knee, on every member's screen. `coachNotes` no longer travels at all;
   * `blurb` does, because the operator wrote it to members on purpose.
   */
  const prose = JSON.stringify([programme?.blurb ?? '', programme?.name ?? ''])
  for (const secret of OPERATOR_SECRETS) {
    check(`"${secret}" is not in the prose`, prose.includes(secret), false)
  }

  console.log('\nthe member')
  await lock()
  await unlock('Rio', 'rio-pass')
  await design('male, 24 years old, 68kg, want to build muscle, gym 3 times a week for 1 hour')
  await page.goto(`${APP}/inbox`, { waitUntil: 'networkidle' })
  await page.getByText('Winter, knees intact').first().click()
  await page.getByRole('heading', { name: 'Winter, knees intact' }).waitFor({ timeout: 5000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, '2-member-card.png'), fullPage: true })
  const card = await page.textContent('body')
  for (const word of OPERATOR_WORDS) {
    check(`the member's screen does not show "${word}"`, card.includes(word), false)
  }
  check('the card says what the programme asks of them', /3 days a week/.test(card), true)
  await page.getByRole('button', { name: 'Put it on my calendar' }).click()
  await page.waitForURL(/\/generated\/gen-adopted-/, { timeout: 10000 })
  await page.getByRole('heading', { name: /^Week 1$/ }).waitFor({ timeout: 10000 })
  console.log('  ok    adopted at', page.url())
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, '3-their-own-copy.png'), fullPage: true })
  const mine = await page.textContent('body')
  check('the copy carries the gym’s name for it', mine.includes('Winter, knees intact'), true)
  for (const word of OPERATOR_WORDS) {
    check(`the copy does not carry "${word}"`, mine.includes(word), false)
  }
  /**
   * The positive half: a calendar built for this member at adoption.
   *
   * That the numbers behind it are Rio's own is asserted exactly in
   * `gym-programme.spec.ts` (`mine.input.age === 24`, `weightKg === 68`), which
   * can read the object. This screen only shows a member's weight when they set
   * a target, and dates it in words rather than ISO — two assertions written by
   * guessing at the copy, both of which proved nothing about the code.
   */
  check('the copy is built around the member’s goal', /Build muscle over \d+ weeks/.test(mine), true)
  /* The operator designed this to lose fat. Rio came to build muscle, and the
     copy is described in Rio's terms — which is the whole shape of the feature
     in one line of the page: the gym supplied the training, not the plan.
     Checked on the card too: the goal used to be a tag there, which told Rio
     this programme was for losing fat. It no longer travels at all. */
  check('not around the one the operator designed it from', mine.includes('Lose fat'), false)
  check('and the card never claimed it was', card.includes('Lose fat'), false)

  console.log('\nback at the desk')
  await lock()
  /* The account password, not the old passphrase: opening a sync account
     replaces it, which the dialog says and this proves. */
  await unlock('Hierro Desk', 'desk-account-1')
  await page.goto(`${APP}/gym`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Sent/ }).click()
  await page.waitForTimeout(600)
  const desk = await page.textContent('body')
  check('the gym is told somebody took it', desk.includes('adopted 1'), true)
  check('and is told nothing else about them', desk.includes('gen-adopted'), false)

  check('no page errors', errors, [])
} finally {
  await browser?.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
