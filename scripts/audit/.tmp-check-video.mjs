import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://localhost:64211'
const OUT = process.env.OUT
const browser = await chromium.launch()
const page = await browser.newContext({ viewport: { width: 1100, height: 1100 } }).then(c => c.newPage())
const hosts = []
page.on('request', r => { const h = new URL(r.url()).hostname; if (!h.includes('local') && !h.includes('127.0.0.1')) hosts.push(h) })

await page.goto(BASE, { waitUntil: 'networkidle' })
const P = 'start-'
await page.fill(`#${P}name`, 'Walker')
await page.fill(`#${P}passphrase`, 'walk-pass')
await page.fill(`#${P}repeat-passphrase`, 'walk-pass')
await page.locator(`#${P}name`).press('Enter').catch(() => {})
await page.getByRole('button', { name: 'Create profile' }).last().click()
await page.waitForTimeout(2500)
console.log('after create URL:', page.url())

await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
console.log('library URL:', page.url())
const search = page.locator('input').first()
await search.fill('Barbell Curl')
await page.waitForTimeout(1000)
await page.locator('button').filter({ hasText: /Barbell Curl/ }).first().click()
await page.waitForTimeout(1500)
const before = [...new Set(hosts)]
await page.screenshot({ path: `${OUT}/video-facade.png` })
const play = page.getByRole('button', { name: /Watch on YouTube/i })
console.log('facade visible:', await play.isVisible().catch(() => false))
console.log('3rd-party BEFORE click:', JSON.stringify(before))
await play.click()
await page.waitForTimeout(3500)
console.log('3rd-party AFTER click :', JSON.stringify([...new Set(hosts)].filter(h => !before.includes(h))))
console.log('iframe src:', await page.locator('iframe').first().getAttribute('src').catch(() => 'none'))
await page.screenshot({ path: `${OUT}/video-playing.png` })
await browser.close()
