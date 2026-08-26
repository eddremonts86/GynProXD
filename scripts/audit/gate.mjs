/** Walks the profile gate: creates a walk profile on a fresh context. */
export async function ensureProfile(page, base, name = 'Walker', pass = 'walk-pass') {
  await page.goto(base, { waitUntil: 'networkidle' })
  const createHeading = page.getByRole('heading', { name: 'Create your profile' })
  const unlockHeading = page.getByRole('heading', { name: 'Who is training?' })
  if (await createHeading.isVisible().catch(() => false)) {
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Passphrase', { exact: true }).fill(pass)
    await page.getByLabel('Repeat passphrase').fill(pass)
    await page.getByRole('button', { name: 'Create profile' }).click()
  } else if (await unlockHeading.isVisible().catch(() => false)) {
    await page.getByLabel('Passphrase', { exact: true }).fill(pass)
    await page.getByRole('button', { name: 'Unlock' }).click()
  }
  await page.getByRole('link', { name: 'Forma, go to today' }).waitFor({ timeout: 10000 })
}
