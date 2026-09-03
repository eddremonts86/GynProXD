/**
 * What a stranger downloads before the front door paints, in bytes.
 *
 * The Lighthouse walk next door measures the consequence — Largest Contentful
 * Paint on a throttled phone — and it is the number that matters to a person.
 * It is also the number that moves half a second between two runs on a busy
 * laptop, so a ceiling tight enough to catch a 40 KB library arriving on the
 * critical path is a ceiling loose enough to fail on a Tuesday.
 *
 * This is the same regression measured deterministically. `index.html` lists
 * exactly what the browser must have before it can render anything: the entry
 * script and its `modulepreload` graph, plus the stylesheet. Add up the gzip,
 * compare it to a number. No browser, no network, no variance.
 *
 *   node scripts/audit/bundle-budget.mjs
 *
 * Needs `dist/` built. Reads it directly; nothing has to be served.
 *
 * When this fails the fix is rarely "make the budget bigger". It is usually a
 * package that has been welded to something the first paint needs — see the
 * long comment on `manualChunks` in vite.config.ts for the two that were.
 */
import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const DIST = path.join(ROOT, 'dist')

/**
 * Measured at 245 KB on 2026-09-03, down from 331 KB — the stylesheet counts,
 * it blocks rendering the same as the scripts do. The headroom is for ordinary
 * growth, a component or a hook or a few more icons, and stops well short of
 * letting an animation or component library back in unnoticed.
 */
const BUDGET_KB = 265

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error(`No build at ${DIST}. Run \`pnpm build\` first.`)
  process.exit(2)
}

const html = readFileSync(path.join(DIST, 'index.html'), 'utf8')

/* Everything index.html tells the browser it needs up front. `modulepreload`
   is the entry's own static import graph, which is the whole point: a module
   that got itself into that graph is a module paid for before first paint. */
const hrefs = [
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g),
  ...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g),
].map((m) => m[1])

if (hrefs.length === 0) {
  console.error('Found nothing to weigh in index.html. Has the build output changed shape?')
  process.exit(2)
}

const rows = hrefs.map((href) => {
  const file = path.join(DIST, href.replace(/^\//, ''))
  const kb = gzipSync(readFileSync(file), { level: 9 }).length / 1024
  return { name: path.basename(href), kb }
})

const total = rows.reduce((n, r) => n + r.kb, 0)

for (const { name, kb } of rows.sort((a, b) => b.kb - a.kb)) {
  if (kb < 1) continue
  console.log(`  ${String(Math.round(kb)).padStart(4)} KB  ${name}`)
}
console.log(`  ${'—'.repeat(8)}`)
console.log(`  ${String(Math.round(total)).padStart(4)} KB gzip before first paint, budget ${BUDGET_KB} KB`)

if (total > BUDGET_KB) {
  console.log(
    `\nOver budget by ${Math.round(total - BUDGET_KB)} KB. Something joined the entry's` +
      ` static import graph; find it before raising the number.`,
  )
  process.exit(1)
}
