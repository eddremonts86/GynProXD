import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3010'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
const page = await ctx.newPage()

page.on('console', (m) => { if (m.type()==='error') console.log('console error', m.text()) })
page.on('pageerror', (e) => console.log('pageerror', e))

console.log('goto onboarding')
await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
console.log('fill textarea')
const ta = page.locator('textarea')
await ta.fill('soy hombre 40 años, peso 140kg quiero adelgazar a 80kg, puedo ir 3 veces por semana 2h, gym, esfuerzo medio')
await page.waitForTimeout(500)
const apply = page.getByRole('button', { name: 'Aplicar a formulario' })
if (await apply.isVisible()) await apply.click()
await page.waitForTimeout(500)
const estimateText = await page.textContent('body')
if (!estimateText?.includes('Estimado') && !estimateText?.includes('meses')) {
  console.error('estimate not found')
  process.exit(1)
}
console.log('estimation visible')
const genBtn = page.getByRole('button', { name: 'Generar plan' })
await genBtn.click()
await page.waitForURL(/\/generated\/.+/, { timeout: 5000 })
console.log('navigated to', page.url())
await page.waitForTimeout(1000)
const cal = await page.textContent('body')
if (!cal?.includes('Semana 1') && !cal?.includes('Semana')) {
  console.error('calendar not found')
  process.exit(1)
}
console.log('calendar ok')
const saveBtn = page.getByRole('button', { name: 'Guardar en Planner' }).first()
if (await saveBtn.isVisible()) {
  await saveBtn.click()
  await page.waitForTimeout(500)
  console.log('saved to planner')
}
await page.goto(`${BASE}/planner`, { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const plannerText = await page.textContent('body')
if (!plannerText?.includes('Forma') && !plannerText?.includes('Planes')) {
  console.error('planner not ok')
  process.exit(1)
}
console.log('planner ok, checking generated list')
if (plannerText?.includes('Planes generados') || plannerText?.includes('generados')) {
  console.log('generated list visible')
}
await browser.close()
console.log('TEST PASS')
