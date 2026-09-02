#!/usr/bin/env node
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '../..')
const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const OUT_DIR = join(ROOT, '.audit-shots/walk')
const PREFIX = process.env.SHOT_PREFIX ?? 'before'
const REPORT = join(ROOT, `.audit-shots/walk-report-${PREFIX}.json`)
const REPORT_MD = join(ROOT, `.audit-shots/walk-report-${PREFIX}.md`)

const ROUTES = [
  { path: '/', name: 'today' },
  { path: '/onboarding', name: 'onboarding' },
  { path: '/planner', name: 'planner' },
  { path: '/library', name: 'library' },
  { path: '/history', name: 'history' },
  { path: '/settings', name: 'settings' },
]

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812, deviceScaleFactor: 2, isMobile: true },
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false },
]

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const findings = {
  base: BASE,
  startedAt: new Date().toISOString(),
  viewports: VIEWPORTS.map((v) => v.name),
  routes: ROUTES.map((r) => r.path),
  pages: [],
  summary: { total: 0, errors: 0, failedRequests: 0 },
}

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`
    const pageErrors = []
    const consoleErrors = []
    const failedResponses = []
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile,
    })
    const page = await context.newPage()
    page.on('pageerror', (err) => pageErrors.push(String(err)))
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    page.on('response', (res) => {
      const status = res.status()
      if (status >= 400) {
        const req = res.request()
        if (req.resourceType() !== 'image' || status >= 500) {
          failedResponses.push(`${status} ${res.url()}`)
        }
      }
    })
    const start = Date.now()
    let status = 'ok'
    let error = null
    try {
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 })
      if (!response || !response.ok()) {
        status = `http-${response?.status() ?? 'no-response'}`
      }
      await page.waitForTimeout(500)
      const shotName = `${PREFIX}-${vp.name}-${route.name}.png`
      const shotPath = join(OUT_DIR, shotName)
      await page.screenshot({ path: shotPath, fullPage: true })
      console.log(`[walk] ${vp.name} ${route.path} -> ${shotName} (${Date.now() - start}ms)`)
    } catch (e) {
      status = 'error'
      error = String(e)
      console.error(`[walk] FAIL ${vp.name} ${route.path}: ${e}`)
    }
    findings.pages.push({
      viewport: vp.name,
      route: route.path,
      url,
      status,
      error,
      pageErrors,
      consoleErrors,
      failedResponses,
      screenshot: `shots/${PREFIX}-${vp.name}-${route.name}.png`,
      durationMs: Date.now() - start,
    })
    findings.summary.total += 1
    if (pageErrors.length || consoleErrors.length || failedResponses.length || status !== 'ok') {
      findings.summary.errors += 1
    }
    findings.summary.failedRequests += failedResponses.length
    await context.close()
  }
}

findings.finishedAt = new Date().toISOString()
await browser.close()

await writeFile(REPORT, JSON.stringify(findings, null, 2))
console.log(`[walk] report written to ${REPORT}`)

let md = `# Walk Report — enForma\n\n`
md += `- Base: ${BASE}\n`
md += `- Date: ${findings.startedAt}\n`
md += `- Viewports: ${VIEWPORTS.map((v) => `${v.name} (${v.width}x${v.height})`).join(', ')}\n`
md += `- Routes: ${ROUTES.map((r) => r.path).join(', ')}\n\n`
md += `## Summary\n`
md += `- Total pages: ${findings.summary.total}\n`
md += `- Pages with issues: ${findings.summary.errors}\n`
md += `- Failed responses: ${findings.summary.failedRequests}\n\n`
md += `## Pages\n\n`
md += `| Viewport | Route | Status | PageErrors | ConsoleErrors | FailedResponses | Screenshot |\n`
md += `|---|---|---|---|---|---|---|\n`
for (const p of findings.pages) {
  md += `| ${p.viewport} | ${p.route} | ${p.status} | ${p.pageErrors.length} | ${p.consoleErrors.length} | ${p.failedResponses.length} | ${p.screenshot} |\n`
}
md += `\n`
if (findings.pages.some((p) => p.pageErrors.length || p.consoleErrors.length || p.failedResponses.length)) {
  md += `## Details\n\n`
  for (const p of findings.pages) {
    if (p.pageErrors.length || p.consoleErrors.length || p.failedResponses.length || p.error) {
      md += `### ${p.viewport} ${p.route}\n`
      if (p.error) md += `- Error: \`${p.error}\`\n`
      if (p.pageErrors.length) md += `- PageErrors:\n${p.pageErrors.map((e) => `  - \`${e}\``).join('\n')}\n`
      if (p.consoleErrors.length) md += `- ConsoleErrors:\n${p.consoleErrors.map((e) => `  - \`${e}\``).join('\n')}\n`
      if (p.failedResponses.length) md += `- FailedResponses:\n${p.failedResponses.map((e) => `  - \`${e}\``).join('\n')}\n`
      md += `\n`
    }
  }
} else {
  md += `No console/page errors detected.\n`
}
md += `\n---\n`
md += `Screenshots: \`docs/impeccable/shots/${PREFIX}-*.png\`\n`
await writeFile(REPORT_MD, md)
console.log(`[walk] markdown written to ${REPORT_MD}`)

if (findings.summary.errors > 0) {
  console.log(`[walk] completed with ${findings.summary.errors} pages having issues`)
} else {
  console.log(`[walk] all pages ok`)
}
