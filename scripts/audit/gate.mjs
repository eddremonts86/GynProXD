/**
 * The profile gate, in one place.
 *
 * Every walk has to get through the same door, and for a while every walk had
 * its own copy of how. When the landing grew a second sign-in panel — the hero
 * one and another further down the page, both always rendered — all of those
 * copies broke at once and not one of them said so. `ensureProfile` asked
 * `isVisible()` on a selector that now matched two elements, Playwright raised
 * a strict-mode violation, and the `.catch(() => false)` wrapped around it
 * turned that crash into a shrug: neither branch ran, and the walk then waited
 * ten seconds for an app it had never signed into and died naming the wrong
 * thing entirely.
 *
 * So: one implementation, scoped to the hero panel, and no swallowed errors
 * anywhere a selector could be ambiguous. When the door changes again, it
 * changes here, and every walk finds out at the same time.
 */

/** The hero panel. `exact` matters: the second one is "…, second panel". */
export const panelOf = (page) =>
  page.getByRole('region', { name: 'Open your training', exact: true })

const inApp = (page) =>
  page.getByRole('link', { name: 'enForma, go to today' }).waitFor({ timeout: 20000 })

/**
 * Helpers bound to one page.
 *
 * `where()` prefers the hero panel and falls back to the page itself, because
 * the same panel is rendered inside the app on a couple of routes where no
 * landing wraps it.
 *
 * It *waits* for the panel rather than counting it. `count()` returns
 * immediately and has no auto-wait, so on a page that had navigated but not yet
 * hydrated it answered 0 and sent everything back to the unscoped fallback —
 * which is the exact ambiguity this module exists to remove, reintroduced by
 * the check meant to avoid it.
 */
export function door(page, base) {
  const where = async () => {
    const panel = panelOf(page).first()
    const there = await panel
      .waitFor({ state: 'attached', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    return there ? panel : page
  }

  /** The unlock list, as opposed to the first-run create form. */
  const atGate = async () =>
    (await (await where()).getByRole('heading', { name: 'Who is training?' }).count()) > 0

  const lock = async () => {
    await page.goto(`${base}/settings`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Lock profile' }).click()
    await (await where()).getByRole('heading', { name: 'Who is training?' }).waitFor({ timeout: 10000 })
  }

  /**
   * A new profile.
   *
   * No `role` argument on purpose: roles are not self-assigned at the door any
   * more. The first profile on a device becomes its administrator and every
   * later one is granted from the admin panel — see `promote`.
   */
  const create = async (name, pass, { gym } = {}) => {
    const w = await where()
    if (await atGate()) await w.getByRole('button', { name: 'New profile' }).click()
    await w.getByLabel('Name').fill(name)
    if (gym) {
      await w.getByLabel('Gym', { exact: true }).fill(gym)
      /* The listbox is a portal, so it hangs outside the panel. */
      await page.getByRole('option').first().click()
    }
    await w.getByLabel('Passphrase', { exact: true }).fill(pass)
    await w.getByLabel('Repeat passphrase').fill(pass)
    await w.getByRole('button', { name: 'Create profile' }).click()
    await inApp(page)
  }

  const unlock = async (name, pass) => {
    const w = await where()
    /* Past two profiles the list collapses, which is the point of it. */
    const more = w.getByRole('button', { name: /more on this device$/ })
    if ((await more.count()) > 0) await more.click()
    await card(name).click()
    await w.getByLabel('Passphrase', { exact: true }).fill(pass)
    await w.getByRole('button', { name: 'Unlock' }).click()
    await inApp(page)
  }

  /**
   * A profile's card on the unlock list. The button's accessible name is the
   * whole row — "Sol · since 2 Sep" — so matching on the name alone would take
   * "Sol" to "Sol Desk" as readily as to Sol. The name sits in its own span,
   * and an exact text match on that span is the one thing only Sol's card has.
   */
  const card = (name) =>
    panelOf(page)
      .first()
      .getByRole('button')
      .filter({ has: page.getByText(name, { exact: true }) })
      .first()

  /**
   * Grant somebody a role, as an admin, from the admin panel.
   *
   * The caller must already be unlocked as an administrator. `exact` on the
   * option matters: "Gym" is a prefix of nothing here, but "Admin" and
   * "Administrator" have collided before.
   */
  const promote = async (name, role) => {
    await page.goto(`${base}/admin`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: /^Users/ }).click()
    await page.getByRole('combobox', { name: `Role for ${name}` }).click()
    await page.getByRole('option', { name: role, exact: true }).click()
    await page.waitForTimeout(400)
  }

  return { where, atGate, lock, create, unlock, promote, card, inApp: () => inApp(page) }
}

/**
 * Walks the gate for a walk that only needs to be inside the app.
 *
 * Kept because three walks call it and none of them care who they are.
 */
export async function ensureProfile(page, base, name = 'Walker', pass = 'walk-pass') {
  await page.goto(base, { waitUntil: 'networkidle' })
  const d = door(page, base)
  const w = await d.where()
  if ((await w.getByRole('heading', { name: 'Create your profile' }).count()) > 0) {
    await w.getByLabel('Name').fill(name)
    await w.getByLabel('Passphrase', { exact: true }).fill(pass)
    await w.getByLabel('Repeat passphrase').fill(pass)
    await w.getByRole('button', { name: 'Create profile' }).click()
  } else if (await d.atGate()) {
    await w.getByRole('button', { name }).first().click()
    await w.getByLabel('Passphrase', { exact: true }).fill(pass)
    await w.getByRole('button', { name: 'Unlock' }).click()
  }
  await d.inApp()
}
