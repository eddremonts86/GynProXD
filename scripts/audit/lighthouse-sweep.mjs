/**
 * Lighthouse over the two doors a stranger can actually reach.
 *
 * The production-readiness audit listed Lighthouse and never ran it, so the
 * thresholds below are not aspirations: every one of them was measured first
 * and then written down, with a couple of points of slack for the noise a
 * headless run on a busy laptop produces. A threshold invented before the
 * measurement is an opinion, and an opinion in a required check gets switched
 * off the first week it disagrees with somebody.
 *
 *   node scripts/audit/lighthouse-sweep.mjs
 *
 * Needs a built app being served, the same as the other screen walks.
 *
 * Only `/` and `/for-gyms` are swept. Everything else is behind a lock screen,
 * and Lighthouse's cold-load-on-a-slow-phone model says nothing true about a
 * screen you reach on your fourth visit from a warm service worker.
 */
import { chromium } from 'playwright'
import lighthouse from 'lighthouse'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const PORT = 9222

const ROUTES = ['/', '/for-gyms']

/**
 * Mobile is Lighthouse's own default: a mid-tier phone on a throttled
 * connection. Desktop keeps the same audits and takes the throttling off.
 */
const FORM_FACTORS = {
  mobile: {},
  desktop: {
    formFactor: 'desktop',
    screenEmulation: { disabled: true },
    throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
  },
}

/**
 * Measured on 2026-09-03 against the built app, after the entry chunk stopped
 * dragging the movement catalogue, Base UI and an animation library onto the
 * landing page:
 *
 *                        perf  a11y  best  seo   LCP
 *   /          mobile      89   100   100  100   3.1s
 *   /          desktop    100   100   100  100   0.6s
 *   /for-gyms  mobile      89   100   100  100   3.2s
 *   /for-gyms  desktop    100   100   100  100   0.7s
 *
 * Accessibility and best practices are held at 100 because that is where they
 * are; letting them slip to 90 buys nothing and hides the first regression.
 *
 * Mobile performance keeps real slack, and deliberately. Half a second moves
 * between two runs of this on a busy laptop, so a floor tight enough to catch
 * a 40 KB library arriving on the critical path is a floor loose enough to
 * fail on a Tuesday. `bundle-budget.mjs` is the tight guard for that — it
 * weighs the same bytes with no browser and no variance. What is left here is
 * the consequence, and the classes of problem a byte count cannot see.
 */
const FLOORS = {
  mobile: { performance: 82, accessibility: 100, 'best-practices': 100, seo: 100 },
  desktop: { performance: 92, accessibility: 100, 'best-practices': 100, seo: 100 },
}

/**
 * Largest Contentful Paint, in seconds. The app is a client-rendered SPA, so
 * the hero paints when the entry bundle has landed and run — this is a bundle
 * budget wearing a different hat, and it is the honest way to hold one.
 */
const LCP_CEILING = { mobile: 3.8, desktop: 1.5 }

const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] })
const failures = []
const rows = []

try {
  for (const route of ROUTES) {
    for (const [factor, settings] of Object.entries(FORM_FACTORS)) {
      const result = await lighthouse(
        `${BASE}${route}`,
        { port: PORT, output: 'json', logLevel: 'error' },
        { extends: 'lighthouse:default', settings },
      )
      const lhr = result.lhr
      const scores = Object.fromEntries(
        Object.entries(lhr.categories).map(([key, c]) => [key, Math.round(c.score * 100)]),
      )
      const lcp = lhr.audits['largest-contentful-paint'].numericValue / 1000

      rows.push({ route, factor, scores, lcp })

      for (const [category, floor] of Object.entries(FLOORS[factor])) {
        if (scores[category] < floor) {
          failures.push(
            `${route} ${factor}: ${category} ${scores[category]}, floor ${floor}`,
          )
        }
      }
      if (lcp > LCP_CEILING[factor]) {
        failures.push(
          `${route} ${factor}: LCP ${lcp.toFixed(1)}s, ceiling ${LCP_CEILING[factor]}s`,
        )
      }
    }
  }
} finally {
  await browser.close()
}

for (const { route, factor, scores, lcp } of rows) {
  console.log(
    `  ${route.padEnd(11)} ${factor.padEnd(8)} ` +
      `perf=${String(scores.performance).padStart(3)} ` +
      `a11y=${String(scores.accessibility).padStart(3)} ` +
      `best=${String(scores['best-practices']).padStart(3)} ` +
      `seo=${String(scores.seo).padStart(3)}  LCP ${lcp.toFixed(1)}s`,
  )
}

if (failures.length > 0) {
  console.log(`\n${failures.length} below the floor:`)
  for (const f of failures) console.log(`  ${f}`)
  process.exit(1)
}
console.log(`\n${rows.length} runs, all above the floor.`)
