import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const OUT = 'public'
await mkdir(OUT, { recursive: true })

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${Math.round(512 * 0.22)}" fill="#1a1816"/>
  <circle cx="256" cy="238" r="150" fill="#d98e3f" opacity="0.14"/>
  <circle cx="256" cy="238" r="104" fill="#d98e3f" opacity="0.22"/>
  <text x="256" y="330" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="300" font-weight="700" fill="#d98e3f">F</text>
</svg>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 600, height: 600 }, deviceScaleFactor: 1 })

const targets = [
  { name: 'pwa-512x512.png', size: 512 },
  { name: 'pwa-192x192.png', size: 192 },
  { name: 'apple-touch-icon.png', size: 180 },
]

for (const t of targets) {
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg(t.size)}</body>`,
    { waitUntil: 'load' },
  )
  const el = page.locator('svg')
  await el.screenshot({ path: `${OUT}/${t.name}`, omitBackground: false })
  console.log(`wrote ${OUT}/${t.name} (${t.size})`)
}

await browser.close()
console.log('icons regenerated — Noir Warm amber F')
