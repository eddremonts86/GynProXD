/**
 * The accessibility sweep the production-readiness audit could not run.
 *
 * That audit measured contrast on one surface class with `aurora-contrast` and
 * said plainly that the rest was unchecked: no axe, no tool for it, and adding
 * a dependency mid-audit was not the audit's call. This is that tool, run over
 * the whole route inventory rather than a sample.
 *
 * It fails on `serious` and `critical` only. `moderate` and `minor` are printed
 * and not fatal: a walk that blocks a merge on a decorative-list warning gets
 * switched off within a week, and the two severities that matter are the ones
 * that stop somebody using the product.
 *
 *   node scripts/audit/a11y-sweep.mjs
 *
 * Needs a built app being served, the same as the other screen walks.
 */
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import { door } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'

/* WCAG 2.1 A and AA. `best-practice` is deliberately out: it is opinion, and
   opinion in a required check is an argument nobody asked for. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'desktop', width: 1440, height: 900 },
]

/** Signed out: the front doors, which is all a stranger can reach. */
const PUBLIC = ['/', '/for-gyms']

/** With a profile open. The first profile on a device is its administrator,
    so `/admin` belongs to this pass rather than needing its own. */
const MEMBER = [
  '/', '/planner', '/library', '/history', '/settings', '/onboarding',
  '/challenges', '/menu', '/recipes', '/story', '/fitness-test', '/inbox', '/admin',
  /* This pass has no account, so `/day` here is the Pro notice rather than the
     planner. That is a real state with a real button in it and worth sweeping;
     the screen behind the gate is swept by `test-day-plan.mjs`, which is where
     a paid account already exists. */
  '/day',
]

let failures = 0
const notes = []

const run = async (page, label) => {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const soft = violations.filter((v) => v.impact !== 'serious' && v.impact !== 'critical')
  for (const v of soft) notes.push(`${label}: ${v.impact} ${v.id} (${v.nodes.length})`)
  if (bad.length === 0) {
    console.log(`  ok    ${label}`)
    return
  }
  failures += 1
  console.log(`  FAIL  ${label}`)
  for (const v of bad) {
    console.log(`          ${v.impact} ${v.id}: ${v.help}`)
    for (const n of v.nodes.slice(0, 3)) {
      console.log(`            ${n.target.join(' ')}`)
      const detail = (n.failureSummary ?? '').split('\n').map((l) => l.trim()).filter(Boolean)[1]
      if (detail) console.log(`              ${detail.slice(0, 110)}`)
    }
    if (v.nodes.length > 3) console.log(`            and ${v.nodes.length - 3} more`)
  }
}

const browser = await chromium.launch()

try {
  for (const vp of VIEWPORTS) {
    console.log(`\nsigned out, ${vp.name}`)
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    /* The coach is off so no route waits on a vendor call it will not get. */
    await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
    for (const path of PUBLIC) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(500)
      await run(page, `${path} (${vp.name})`)
    }
    await ctx.close()
  }

  for (const vp of VIEWPORTS) {
    console.log(`\nwith a profile open, ${vp.name}`)
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
    const page = await ctx.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await door(page, BASE).create('Ada Sweep', 'sweep-pass')
    for (const path of MEMBER) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(500)
      await run(page, `${path} (${vp.name})`)
    }
    await ctx.close()
  }
  /* `/gym` last, because reaching it costs a promotion: the first profile on a
     device is its administrator and the gym role is granted from `/admin`. It
     is the surface the paying customer works in all day, so it is worth the
     extra fifteen seconds a viewport. */
  for (const vp of VIEWPORTS) {
    console.log(`\nat the gym desk, ${vp.name}`)
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } })
    await ctx.addInitScript(() => localStorage.setItem('forma-coach', 'off'))
    const page = await ctx.newPage()
    const gate = door(page, BASE)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await gate.create('Ada Sweep', 'sweep-pass')
    await gate.lock()
    await gate.create('Sol Desk', 'desk-pass', { gym: 'Sweep House' })
    await gate.lock()
    await gate.unlock('Ada Sweep', 'sweep-pass')
    await gate.promote('Sol Desk', 'Gym')
    await gate.lock()
    await gate.unlock('Sol Desk', 'desk-pass')
    await page.goto(`${BASE}/gym`, { waitUntil: 'networkidle' }).catch(() => {})
    await page.waitForTimeout(700)
    await run(page, `/gym (${vp.name})`)
    await ctx.close()
  }
} finally {
  await browser.close()
}

if (notes.length) {
  console.log(`\n${notes.length} moderate or minor, not fatal:`)
  const seen = new Map()
  for (const n of notes) {
    const key = n.split(': ')[1]
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  for (const [k, n] of [...seen].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${String(n).padStart(3)}x ${k}`)
  }
}

console.log(failures === 0 ? '\nall clear\n' : `\n${failures} screens with serious or critical findings\n`)
process.exit(failures === 0 ? 0 : 1)
