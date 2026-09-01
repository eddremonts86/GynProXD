/**
 * What the aurora material can actually carry, measured off the painted pixels.
 *
 * `AuroraTile` and the gym card in `from-your-gym.tsx` both put type on the
 * app's one coloured material, and the component says the white was "verified
 * at 3:1 (large) and 4.5:1 (small) against the gradient's saturated centre".
 * On the rendered page that does not hold in the light theme: the whole
 * surface — not just the pale corner the comment worries about — is too light
 * for white type.
 *
 * The probe renders each surface's own computed `background-image` into an SVG
 * foreignObject, draws that to a canvas and reads the pixels, so it measures
 * the gradient as painted rather than the stops as written. Every pixel is
 * sampled, and the worst one is what gets reported: text moves, and a surface
 * is only safe if all of it is.
 *
 *   node scripts/audit/aurora-contrast.mjs
 *
 * Needs a dev server; point at it with BASE_URL.
 */
import { chromium } from 'playwright'
import { door } from './gate.mjs'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'

/** Small text needs 4.5:1, large (>=24px, or >=18.66px bold) needs 3:1. */
const NEED_SMALL = 4.5

let failures = 0
const check = (label, got, ok) => {
  if (!ok) failures += 1
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}: ${got}`)
}

const PROBE = () => {
  window.__probe = async function (el) {
    const r = el.getBoundingClientRect()
    const w = Math.ceil(r.width)
    const h = Math.ceil(r.height)
    const bg = getComputedStyle(el).backgroundImage
    const svg =
      `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
      `<foreignObject width='100%' height='100%'>` +
      `<div xmlns='http://www.w3.org/1999/xhtml' style="width:${w}px;height:${h}px;` +
      `background-image:${bg.replace(/"/g, '&quot;')}"></div>` +
      `</foreignObject></svg>`
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    })
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return { ctx, w, h }
  }

  window.__scan = async function () {
    const lum = ([r, g, b]) => {
      const f = (v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    /* Six digits or three: a production build minifies `#ffffff` to `#fff`, and
       the first version of this only understood the long form — so it measured
       the deployed site as NaN and called it a failure. */
    const hex = (h) => {
      const v = h.replace('#', '')
      const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
    }
    const ratio = (a, b) => {
      const [hi, lo] = a > b ? [a, b] : [b, a]
      return (hi + 0.05) / (lo + 0.05)
    }
    const css = getComputedStyle(document.documentElement)
    /* The colour the theme actually puts on this material. Checking white in
       both themes was checking a colour the light theme no longer uses. */
    const typeHex = css.getPropertyValue('--aurora-ink').trim()
    const type = lum(hex(typeHex))

    /* Only surfaces that carry type. The decorative wash on the landings uses
       the same material and is painted at 16% opacity behind everything, so
       measuring it would answer a question nobody asked. */
    const els = [...document.querySelectorAll('.aurora-green,.aurora-orange')].filter(
      (e) => e.getBoundingClientRect().width > 0 && e.textContent.trim().length > 0,
    )

    const out = []
    for (const el of els) {
      const p = await window.__probe(el)
      const d = p.ctx.getImageData(0, 0, p.w, p.h).data
      let worstType = Infinity
      let brightest = 0
      let darkest = 1
      for (let y = 0; y < p.h; y += 2) {
        for (let x = 0; x < p.w; x += 2) {
          const i = (y * p.w + x) * 4
          const gl = lum([d[i], d[i + 1], d[i + 2]])
          worstType = Math.min(worstType, ratio(type, gl))
          brightest = Math.max(brightest, gl)
          darkest = Math.min(darkest, gl)
        }
      }
      const cls = typeof el.className === 'string' ? el.className : ''
      out.push({
        tone: cls.includes('aurora-green') ? 'green' : 'orange',
        size: `${p.w}x${p.h}`,
        text: el.textContent.trim().slice(0, 24).replace(/\s+/g, ' '),
        type: +worstType.toFixed(2),
        span: `${darkest.toFixed(3)}–${brightest.toFixed(3)}`,
      })
    }
    return {
      /* Reported, never inferred. An earlier version guessed the theme from the
         ink token and printed two passes with their numbers swapped, because
         the page was not in the theme the runner had asked for. */
      rootClass: document.documentElement.className || '(none)',
      typeColour: typeHex,
      auroraMid: getComputedStyle(document.documentElement).getPropertyValue('--aurora-green-mid').trim(),
      surfaces: out,
    }
  }
}

const browser = await chromium.launch()

try {
  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: 1400, height: 950 },
      colorScheme: theme,
      /* This app is a PWA. Without this the service worker serves the first
         page load out of its precache, and an edit made seconds earlier is
         measured against the stylesheet it replaced — which is exactly how one
         run of this script reported the landing tile carrying the *old dark*
         material while the page around it was light. */
      serviceWorkers: 'block',
    })
    await ctx.addInitScript(PROBE)
    const page = await ctx.newPage()
    const { create, lock } = door(page, BASE)

    console.log(`\n${theme}`)

    /* The landing first: it needs no profile, and it is where the tile is
       biggest. */
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    let seen = 0
    for (const [where, run] of [
      ['landing', async () => {}],
      [
        'app',
        async () => {
          /* Today and the generated plan need somebody signed in with a plan. */
          await create('Probe', 'probe-pass')
          await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })
          await page.locator('textarea').first().fill('male 34, 92kg, target 82kg, gym 3 times a week for an hour')
          await page.getByRole('button', { name: 'Use this and check it' }).click()
          await page.waitForTimeout(400)
          const finish = page.getByRole('button', { name: /Design my programme/ })
          for (let i = 0; i < 10 && (await finish.count()) === 0; i++) {
            await page.getByRole('button', { name: /^(Continue|Skip and fill it in)/ }).click()
            await page.waitForTimeout(250)
          }
          await finish.click()
          await page.waitForURL(/\/generated\/.+/, { timeout: 180000 })
          await page.getByRole('heading', { name: /^Week 1$/ }).waitFor({ timeout: 20000 })
        },
      ],
    ]) {
      await run()
      for (const route of where === 'landing' ? ['/'] : [page.url(), `${BASE}/`]) {
        await page.goto(route, { waitUntil: 'networkidle' }).catch(() => {})
        await page.waitForTimeout(900)
        const res = await page.evaluate(() => window.__scan())
        console.log(
          `  [${route.replace(BASE, '') || '/'}] root="${res.rootClass}" type=${res.typeColour} green-mid=${res.auroraMid}`,
        )
        for (const s of res.surfaces) {
          seen += 1
          check(
            `${theme} · ${s.tone} ${s.size} · "${s.text}"`,
            `${s.type}:1  (material luminance ${s.span})`,
            s.type >= NEED_SMALL,
          )
        }
      }
    }
    if (seen === 0) check(`${theme}: found no aurora surface carrying text`, 'none', false)
    await lock().catch(() => {})
    await ctx.close()
  }
} finally {
  await browser.close()
}

console.log(
  failures === 0
    ? '\nevery aurora surface carries its type at 4.5:1\n'
    : `\n${failures} of the measurements are under 4.5:1\n`,
)
process.exit(failures === 0 ? 0 : 1)
