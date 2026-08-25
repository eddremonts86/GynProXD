/**
 * Renders the Forma mark (four rules of decreasing length, read as a measuring
 * scale) into the PWA icon set and the favicon. Run after changing the brand
 * colour so every surface stays in step.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = 'public'
const BRAND = '#1d47d6'
const INK = '#ffffff'

/** Bars sit inside the middle 60% so the art survives a maskable crop. */
const BARS = [
  { width: 304, opacity: 1 },
  { width: 228, opacity: 0.78 },
  { width: 152, opacity: 0.56 },
  { width: 76, opacity: 0.34 },
]
const BAR_HEIGHT = 30
const BAR_GAP = 30
const TOP = (512 - (BARS.length * BAR_HEIGHT + (BARS.length - 1) * BAR_GAP)) / 2

function mark({ radius = 112, background = BRAND } = {}) {
  const bars = BARS.map(
    (bar, i) =>
      `  <rect x="104" y="${TOP + i * (BAR_HEIGHT + BAR_GAP)}" width="${bar.width}" ` +
      `height="${BAR_HEIGHT}" rx="${BAR_HEIGHT / 2}" fill="${INK}" opacity="${bar.opacity}"/>`,
  ).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${radius}" fill="${background}"/>
${bars}
</svg>`
}

await mkdir(OUT, { recursive: true })
await writeFile(`${OUT}/favicon.svg`, `${mark({ radius: 96 })}\n`)
console.log(`wrote ${OUT}/favicon.svg`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 })

for (const { name, size, radius } of [
  { name: 'pwa-512x512.png', size: 512, radius: 112 },
  { name: 'pwa-192x192.png', size: 192, radius: 112 },
  { name: 'apple-touch-icon.png', size: 180, radius: 0 },
]) {
  const svg = mark({ radius }).replace('width="512" height="512"', `width="${size}" height="${size}"`)
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`, {
    waitUntil: 'load',
  })
  await page.locator('svg').screenshot({ path: `${OUT}/${name}`, omitBackground: radius > 0 })
  console.log(`wrote ${OUT}/${name} (${size})`)
}

await browser.close()
