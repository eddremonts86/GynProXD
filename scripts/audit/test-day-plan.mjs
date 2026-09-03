/**
 * The day planner, through the app.
 *
 * `day-plan.spec.ts` proves the arithmetic exhaustively and cannot see a
 * screen. This walks the three things it has no access to:
 *
 *   the gate      /day refuses an account that has not paid, and opens for one
 *                 that has, without a reload, because the entitlement lands in
 *                 the session store rather than in a page load
 *   the form      an anchor entered by hand survives into the day
 *   the day       the timeline draws the anchor and names the free time around
 *                 it, and the header's free total moves with it
 *   the companion a paragraph becomes proposals, the guesses are labelled as
 *                 guesses, and nothing is saved until it is tapped
 *   the calendar  a real .ics file blocks real time, its titles are shown and
 *                 not stored unless asked, and the day exports back out
 *   the gym bus   an event the member said yes to blocks time; one they have
 *                 not answered does not
 *
 * The last one is the whole feature in one assertion. Everything else on that
 * screen comes from somewhere else in the app; what this phase added is the
 * word "when", and this is where somebody can see it.
 *
 *   node scripts/audit/test-day-plan.mjs
 *
 * Needs the PocketBase binary at deploy/pocketbase/.local/pocketbase and a
 * server for the app; point at it with BASE_URL.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import AxeBuilder from '@axe-core/playwright'
import { chromium } from 'playwright'
import { door } from './gate.mjs'
import { startSandbox } from './pb-sandbox.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const SHOTS = process.env.SHOT_DIR ?? path.join(import.meta.dirname, '../../.audit-shots')

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

const grantPro = (args) =>
  new Promise((resolve) => {
    const p = spawn('node', ['scripts/admin/grant-pro.mjs', '--server', pb.base, ...args], {
      env: { ...process.env, PB_SUPERUSER_EMAIL: 'probe@enforma.test', PB_SUPERUSER_PASSWORD: 'Sup3rSecret123' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('exit', (code) => resolve({ code, out: out.trim() }))
  })

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const { create } = door(page, BASE)

  const main = () => page.locator('main')
  const dayText = async () => (await main().innerText()).replace(/\s+/g, ' ').trim()

  console.log('\nbefore anybody has paid')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await create('Planner', 'planner-pass')
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  const refused = await dayText()
  check('the day is refused', /Part of Pro/.test(refused), true)
  check('and it does not draw a day behind the notice', /Hours you do not choose/.test(refused), false)
  check('it points at where the account state lives', /Open Settings/.test(refused), true)

  console.log('\nan account that has')
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: /^Data/ }).click()
  await page.getByRole('button', { name: 'Create sync account' }).click()
  await page.getByLabel('Email').fill('planner@day.test')
  await page.getByLabel('Password', { exact: true }).fill('planner-account-1')
  await page.getByLabel('Repeat password').fill('planner-account-1')
  await page.getByRole('button', { name: 'Advanced' }).click()
  await page.getByLabel('Server').fill(pb.base)
  await page.getByRole('button', { name: /Create and upload|Creating/ }).click()
  await page.waitForTimeout(2500)
  check('the account exists', (await pb.userByEmail('planner@day.test')) !== null, true)
  /* The recovery code is shown exactly once and its dialog sits over the page
     until it is acknowledged, so nothing behind it is clickable. Dismissing it
     is what a person does here too. */
  await page.getByRole('button', { name: 'I wrote it down' }).click()
  await page.waitForTimeout(300)

  check('the grant script exits clean', (await grantPro(['--account', 'planner@day.test', '--months', '1'])).code, 0)
  /**
   * Checked from the panel rather than by reloading, on purpose. The
   * entitlement is published into the session store, so the nav item and the
   * gate have to change without a page load; a reload here would pass whether
   * or not that worked.
   */
  const panel = page.getByRole('region', { name: 'Subscription' })
  await panel.getByRole('button', { name: /Check again|Checking/ }).click()
  await page.waitForTimeout(1500)
  check('the panel says Pro', /Paid up to/.test(await panel.innerText()), true)
  check(
    'and the rail grew a way in, with no reload',
    await page.getByRole('link', { name: 'Your day' }).count(),
    1,
  )

  console.log('\nan empty day')
  await page.getByRole('link', { name: 'Your day' }).click()
  /* The route is lazy, so the URL matches before anything is rendered.
     Waiting on the heading is waiting for the screen. */
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  const empty = await dayText()
  check('opens now', /Your day/.test(empty), true)
  check('with sixteen hours of nothing', /16h free/.test(empty), true)
  check('and says what it wants', /Nothing fixed yet/.test(empty), true)

  console.log('\nan hour somebody does not choose')
  await page.getByRole('button', { name: 'Add fixed hours' }).click()
  await page.getByLabel('What is it').fill('work')
  await page.getByLabel('Starts').fill('09:00')
  await page.getByLabel('Ends').fill('17:00')
  await page.getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(500)
  const withWork = await dayText()
  check('is on the day', /work/.test(withWork), true)
  check('at the hours it was given', /09:00 to 17:00/.test(withWork), true)

  console.log('\nand the day around it')
  /* This is the feature: the free time either side, named, with no activity
     invented to fill it. Default window is 07:00 to 23:00. */
  check('two hours before it', /2h free/.test(withWork), true)
  check('six hours after it', /6h free/.test(withWork), true)
  check('and the total moved with it', /8h free/.test(withWork), true)
  check('nothing was invented to fill the gaps', /Rest|Free time|Downtime/.test(withWork), false)

  /* One picture of the thing this phase built, for whoever reads the run. */
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, 'day-plan.png'), fullPage: false })

  console.log('\nthe screen behind the gate, for axe')
  /**
   * `a11y-sweep.mjs` reaches `/day` with no account, so what it sweeps there is
   * the Pro notice. The planner itself only exists for a paid account, which is
   * what this walk already has open, so the sweep of the real screen belongs
   * here rather than in a second harness that would have to pay for one.
   */
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.nodes.length})`)
  check('no serious or critical violations', serious, [])

  console.log('\nwhat the form refuses')
  await page.getByRole('button', { name: 'Add more fixed hours' }).click()
  await page.getByLabel('What is it').fill('night shift')
  await page.getByLabel('Starts').fill('22:00')
  await page.getByLabel('Ends').fill('06:00')
  await page.getByRole('button', { name: 'Add it' }).click()
  await page.waitForTimeout(300)
  const refusedAnchor = await dayText()
  check('an entry that ends before it starts is refused', /two entries/.test(refusedAnchor), true)
  /* Counting the rows rather than searching the text: the rejected label is
     still sitting in the form's own input, and an input's value is not part of
     innerText, so a text search would have "proved" it was not saved either
     way. One remove button per saved anchor is the fact worth asserting. */
  check('and nothing was added', await page.getByRole('button', { name: /^Remove / }).count(), 1)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.waitForTimeout(300)
  check('cancelling leaves the one good anchor', await page.getByRole('button', { name: /^Remove / }).count(), 1)

  console.log('\nToday, while the day has something on it')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  const today = await dayText()
  check('carries one line into the day', /No session today/.test(today), true)
  check('with the free total on it', /8h free/.test(today), true)

  console.log('\nthe companion')
  await page.goto(`${BASE}/day/intake`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Describe your week', level: 1 }).waitFor({ timeout: 10000 })
  const intake = await dayText()
  /* No coach is configured against a sandbox, so the sentence has to be the
     one that promises nothing leaves. The point of `where()` living in one
     place is that this sentence and the request cannot disagree. */
  check('says where the words go, before the box is used', /Nothing you type here is sent anywhere/.test(intake), true)
  check('and nothing is proposed before it is asked', /What it read/.test(intake), false)

  await page.getByLabel('Describe your week').fill(
    'I work 09:00 to 17:00, the school run is at 08:15, and I get the train home 17:30 to 18:15',
  )
  await page.getByRole('button', { name: /Read it|Reading/ }).click()
  await page.waitForTimeout(1200)
  const readOut = await dayText()
  check('reads the three things out of one paragraph', /What it read/.test(readOut), true)
  check('read on this device, with no coach behind it', /read on this device/.test(readOut), true)
  /* The labels, not just the presence of a row. "school run is" and "get train
     home" both shipped once and read badly on a screen somebody opens every
     morning. */
  check('names the school run cleanly', /school run\b/.test(readOut), true)
  check('and the train, without the verb that got to it', /train home/.test(readOut), true)
  check('with no copula left on the end', /school run is/.test(readOut), false)
  /* The work hours are already on the profile from the form above, so that
     proposal is filtered rather than offered twice. */
  check('does not offer back an hour already on the day', await page.getByRole('button', { name: 'Keep' }).count(), 2)
  check('labels what it worked out rather than quoted', /Worked out/.test(readOut), true)
  check('and says nothing is saved until it is kept', /Nothing here is saved until you keep it/.test(readOut), true)
  await page.screenshot({ path: path.join(SHOTS, 'day-intake.png'), fullPage: false })

  console.log('\nkeeping one of them')
  await page.getByRole('button', { name: 'Keep' }).first().click()
  await page.waitForTimeout(400)
  check('one fewer to decide about', await page.getByRole('button', { name: 'Keep' }).count(), 1)
  check('and it says so', /1 hour kept/.test(await dayText()), true)

  console.log('\ndiscarding the other')
  await page.getByRole('button', { name: /^Discard / }).first().click()
  await page.waitForTimeout(400)
  check('nothing left to decide', await page.getByRole('button', { name: 'Keep' }).count(), 0)

  console.log('\nwhat reached the day')
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  const afterIntake = await dayText()
  check('the kept hour is on it', /school run/.test(afterIntake), true)
  check('the discarded one is not', /train home/.test(afterIntake), false)
  check('two anchors now', await page.getByRole('button', { name: /^Remove / }).count(), 2)

  console.log('\nan hour they would rather train')
  /* Work 09:00-17:00 leaves 07:00-08:15 (the school run now takes 08:15),
     and 17:00-23:00. Without a preference a 90 minute session takes the
     evening; asked for the morning it cannot fit, so it stays in the evening. */
  await page.getByLabel('Train around').fill('20:00')
  await page.waitForTimeout(400)
  check('the preference is held', await page.getByLabel('Train around').inputValue(), '20:00')

  console.log('\na calendar file')
  /* Dates relative to today, because the parser windows on today and a fixture
     with fixed dates would start passing for the wrong reason and then stop. */
  const inDays = (n) => {
    const at = new Date()
    at.setDate(at.getDate() + n)
    return `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`
  }
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'BEGIN:VEVENT',
    `DTSTART;TZID=Europe/Madrid:${inDays(0)}T190000`,
    `DTEND;TZID=Europe/Madrid:${inDays(0)}T210000`,
    'SUMMARY:Dentist, the long appointment',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${inDays(1)}`,
    `DTEND;VALUE=DATE:${inDays(2)}`,
    'SUMMARY:Somebody birthday',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART:${inDays(3)}T100000`,
    `DTEND:${inDays(3)}T110000`,
    'SUMMARY:Focus block',
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  const dir = await mkdtemp(path.join(tmpdir(), 'enforma-ics-'))
  const file = path.join(dir, 'calendar.ics')
  await writeFile(file, ics, 'utf8')

  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  const preview = await dayText()
  check('the timed event is offered', /Dentist, the long appointment/.test(preview), true)
  check('the all-day one is not', /birthday/i.test(preview), false)
  check('nor the one the calendar calls free', /Focus block/.test(preview), false)
  check('one event, not three', /1 event found/.test(preview), true)
  check('and the titles are off by default', /Titles are shown here and not saved/.test(preview), true)

  await page.getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  const withBlock = await dayText()
  check('it went on the day', /1 block added/.test(withBlock), true)
  check('as Busy, with no title stored', /Busy/.test(withBlock), true)
  check('and the title did not follow it', /Dentist/.test(withBlock), false)
  /* 16h awake, less 8h of work, half an hour of school run and the two hours
     the dentist takes. */
  check('the free total dropped by what it takes', /5h 30m free/.test(withBlock), true)
  await page.screenshot({ path: path.join(SHOTS, 'day-calendar.png'), fullPage: false })

  console.log('\nthe same file again')
  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  /* Importing twice is what somebody does when they are not sure it worked. */
  check('adds nothing', /Nothing new/.test(await dayText()), true)

  console.log('\nkeeping the titles, when asked')
  await page.getByRole('button', { name: /^Forget \d+ imported/ }).click()
  await page.waitForTimeout(400)
  await page.setInputFiles('#ics-file', file)
  await page.waitForTimeout(600)
  await page.getByRole('switch', { name: 'Keep the titles' }).click()
  await page.getByRole('button', { name: 'Add the ticked ones' }).click()
  await page.waitForTimeout(600)
  check('the title is on the day now', /Dentist, the long appointment/.test(await dayText()), true)

  console.log('\nexporting the day')
  const download = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: /Send today to my calendar/ }).click()
  const saved = await download
  check('a file comes back', saved.suggestedFilename().endsWith('.ics'), true)

  console.log('\nforgetting what was imported')
  await page.getByRole('button', { name: /^Forget \d+ imported/ }).click()
  await page.waitForTimeout(500)
  const cleared = await dayText()
  check('the block is gone', /Dentist/.test(cleared), false)
  check('and the anchors are not', /school run/.test(cleared), true)

  console.log('\nan event the gym published')
  /**
   * Seeded into the device bus rather than published through the gym panel,
   * which `test-gym-flow` already walks end to end. What is new here is the
   * day planner reading it, and that is what this exercises: the same row
   * shape the bus holds, unanswered first and answered second, so the rule
   * that decides between them is the thing under test.
   */
  const eventDate = await page.evaluate(() => {
    const at = new Date()
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`
  })
  const seed = async (rsvp) => {
    await page.evaluate(
      ([date, answer]) => {
        const raw = localStorage.getItem('forma-gym-messages')
        const rows = raw ? JSON.parse(raw) : []
        const mine = rows.filter((r) => r.id !== 'seeded-event')
        mine.push({
          id: 'seeded-event',
          gym: '',
          authorId: 'op-seed',
          createdAt: new Date().toISOString(),
          kind: 'event',
          /* The open door: the scope that reaches somebody with no gym, which
             is what "what is on near me" actually means for this member. A
             default-scoped message would need them to belong to the gym that
             sent it. */
          scope: 'open-door',
          title: 'Salsa night at the club',
          audience: 'all',
          readBy: [],
          rsvp: answer,
          saved: [],
          event: { date, time: '20:00', place: 'The club' },
        })
        localStorage.setItem('forma-gym-messages', JSON.stringify(mine))
      },
      [eventDate, rsvp],
    )
    await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
    await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })
  }

  /* Unanswered: an invitation, not a commitment. */
  await seed({})
  const unanswered = await dayText()
  check('an invitation does not touch the day', /Salsa night/.test(unanswered), false)

  /* Answered yes: something they said they would turn up to. */
  const profileId = await page.evaluate(() => {
    const raw = localStorage.getItem('forma-profiles')
    const parsed = raw ? JSON.parse(raw) : null
    return parsed?.profiles?.[0]?.id ?? null
  })
  check('the walk found the profile it is answering as', typeof profileId, 'string')
  await seed({ [profileId]: 'yes' })
  const answered = await dayText()
  check('one they said yes to is on the day', /Salsa night at the club/.test(answered), true)
  check('at the hour it was answered for', /20:00 to 21:00/.test(answered), true)

  /* Cleared before the checks below, which are about an empty day. Leaving a
     seeded hour on it would have made three later assertions fail for a reason
     that has nothing to do with what they test. */
  await page.evaluate(() => {
    const raw = localStorage.getItem('forma-gym-messages')
    const rows = raw ? JSON.parse(raw) : []
    localStorage.setItem(
      'forma-gym-messages',
      JSON.stringify(rows.filter((r) => r.id !== 'seeded-event')),
    )
  })
  /* And reloaded, because the bus is hydrated from localStorage on boot and a
     same-tab write raises no storage event. Without this the store still holds
     the seeded hour and the checks below count it. */
  await page.goto(`${BASE}/day`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Your day', level: 1 }).waitFor({ timeout: 10000 })

  console.log('\ntaking it back off')
  await page.getByRole('button', { name: 'Remove school run' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Remove work' }).click()
  await page.waitForTimeout(500)
  const afterRemove = await dayText()
  check('the anchor is gone', /Nothing fixed yet/.test(afterRemove), true)
  check('and the day is whole again', /16h free/.test(afterRemove), true)

  console.log('\nToday, with a day that holds nothing')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  /* The line does not render at all here, and that is the intended behaviour:
     Today already says an empty day is empty, and a second line repeating it is
     furniture. */
  check('carries no line', /No session today|free/.test(await dayText()), false)

  console.log('\nthe console')
  check('nothing threw', errors, [])
} finally {
  await browser.close()
  await pb.stop()
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} failed\n`)
process.exit(failures === 0 ? 0 : 1)
