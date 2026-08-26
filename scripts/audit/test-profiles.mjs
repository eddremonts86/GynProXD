/**
 * The isolation proof: two profiles on one device cannot see each other, a
 * wrong passphrase opens nothing, data at rest is ciphertext, and plaintext
 * data from before profiles is migrated in and wiped.
 */
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:3015'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })

// Seed pre-profile plaintext data: one finished workout.
await ctx.addInitScript(() => {
  localStorage.setItem('forma-coach', 'off')
  // Init scripts run on every navigation; only seed before any profile exists,
  // otherwise this would resurrect the plaintext the app just wiped.
  if (localStorage.getItem('forma-profiles')) return
  localStorage.setItem(
    'gynproxd-v2',
    JSON.stringify({
      state: {
        customExercises: [],
        bodyweight: [],
        plans: [],
        generatedPlans: [],
        activeWorkout: null,
        workouts: [
          {
            id: 'legacy-1',
            date: '2026-08-20',
            exercises: [{ exerciseId: 'Pushups', sets: [{ weight: 0, reps: 12 }] }],
          },
        ],
      },
      version: 0,
    }),
  )
})
const page = await ctx.newPage()

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

const lock = async () => {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Lock profile' }).click()
  await page.getByRole('heading', { name: 'Who is training?' }).waitFor({ timeout: 5000 })
}

// 1. First run: the gate offers migration into profile A.
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('heading', { name: 'Create your profile' }).waitFor({ timeout: 5000 })
if (!(await page.textContent('body'))?.includes('before profiles existed')) {
  fail('legacy migration notice missing')
}
await page.getByLabel('Name').fill('Ana')
await page.getByLabel('Passphrase', { exact: true }).fill('ana-secret')
await page.getByLabel('Repeat passphrase').fill('ana-secret')
await page.getByRole('button', { name: 'Create profile' }).click()
await page.getByRole('link', { name: 'Forma, go to today' }).waitFor({ timeout: 10000 })

await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
if (!(await page.textContent('body'))?.includes('Nothing recorded yet')) {
  console.log('ok: profile A sees the migrated session')
} else {
  fail('migrated legacy session missing from profile A')
}

// 2. At-rest storage is ciphertext and the plaintext original is gone.
const storage = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    out[k] = localStorage.getItem(k) ?? ''
  }
  return out
})
if (storage['gynproxd-v2']) fail('plaintext legacy store still present after migration')
const dataKeys = Object.keys(storage).filter((k) => k.startsWith('forma-data-'))
if (dataKeys.length !== 1) fail(`expected 1 encrypted store, found ${dataKeys.length}`)
if (storage[dataKeys[0]].includes('Pushups')) fail('profile data readable in plaintext at rest')
console.log('ok: data at rest is ciphertext, legacy plaintext wiped')

// 3. Profile B sees none of it.
await lock()
await page.getByRole('button', { name: 'New profile' }).click()
await page.getByLabel('Name').fill('Bruno')
await page.getByLabel('Gym', { exact: true }).fill('Iron Barn')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('bruno-secret')
await page.getByLabel('Repeat passphrase').fill('bruno-secret')
await page.getByRole('button', { name: 'Create profile' }).click()
await page.getByRole('link', { name: 'Forma, go to today' }).waitFor({ timeout: 10000 })
await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
if (!(await page.textContent('body'))?.includes('Nothing recorded yet')) {
  fail('profile B can see profile A data')
}
console.log('ok: profile B starts empty')

// 4. A wrong passphrase opens nothing; the right one restores A's data.
await lock()
await page.getByRole('button', { name: 'Ana' }).click()
await page.getByLabel('Passphrase', { exact: true }).fill('bruno-secret')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByText('does not open this profile').waitFor({ timeout: 5000 })
console.log('ok: wrong passphrase rejected')

await page.getByLabel('Passphrase', { exact: true }).fill('ana-secret')
await page.getByRole('button', { name: 'Unlock' }).click()
await page.getByRole('link', { name: 'Forma, go to today' }).waitFor({ timeout: 10000 })
await page.goto(`${BASE}/history`, { waitUntil: 'networkidle' })
await page.getByRole('button', { expanded: false }).first().click()
await page.getByText('Pushups').first().waitFor({ timeout: 5000 })
console.log('ok: profile A unlocks with its own data intact')

// 5. The gym landed in the public registry and the device catalogue.
const registry = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
const bruno = registry.profiles.find((p) => p.name === 'Bruno')
if (bruno?.gym !== 'Iron Barn') fail(`Bruno's gym missing from registry: ${bruno?.gym}`)
if (!registry.gyms?.includes('Iron Barn')) fail('gym catalogue missing the created gym')
console.log('ok: gym recorded in registry and catalogue')

// 6. Personal details encrypt with the profile and survive a reload.
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.getByLabel('Age').fill('41')
await page.getByRole('button', { name: 'Save details' }).click()
await page.getByText('Saved.').waitFor({ timeout: 5000 })
await page.waitForTimeout(700) // autosave debounce
await page.reload({ waitUntil: 'networkidle' })
if ((await page.getByLabel('Age').inputValue()) !== '41') {
  fail('personal details lost after reload')
}
const leaked = await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k.startsWith('forma-data-') && localStorage.getItem(k)?.includes('profileDetails')) {
      return true
    }
  }
  return false
})
if (leaked) fail('personal details readable in plaintext at rest')
console.log('ok: personal details encrypted and persistent')

// 7. Admin edits another profile's public record, then deletes it whole.
await page.locator('form').getByLabel('Name').waitFor({ state: 'hidden' }).catch(() => {})
await page.getByRole('button', { name: 'Edit Bruno' }).click()
await page.locator('form').getByLabel('Gym', { exact: true }).fill('Peak House')
await page.getByRole('option', { name: 'Add gym' }).click()
await page.locator('form').getByRole('button', { name: 'Save' }).click()
const afterEdit = await page.evaluate(() => JSON.parse(localStorage.getItem('forma-profiles')))
if (afterEdit.profiles.find((p) => p.name === 'Bruno')?.gym !== 'Peak House') {
  fail('admin gym edit did not stick')
}
console.log('ok: admin edited another profile gym')

await page.getByRole('button', { name: 'Delete Bruno' }).click()
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForTimeout(300)
const afterDelete = await page.evaluate(() => ({
  registry: JSON.parse(localStorage.getItem('forma-profiles')),
  dataKeys: Object.keys(localStorage).filter((k) => k.startsWith('forma-data-')),
}))
if (afterDelete.registry.profiles.some((p) => p.name === 'Bruno')) {
  fail('deleted profile still in registry')
}
if (afterDelete.dataKeys.length !== 1) {
  fail(`expected 1 encrypted store after delete, found ${afterDelete.dataKeys.length}`)
}
console.log('ok: admin delete removed the profile and its ciphertext')

await browser.close()
if (!process.exitCode) console.log('\nprofile isolation ok')
