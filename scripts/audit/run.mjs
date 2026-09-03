/**
 * Runs the audit walks, in groups, and says what happened.
 *
 * The list lived in whoever's shell history last ran it, which is how five of
 * these came to be failing at their first step for weeks with nobody noticing.
 * It lives here now, and CI calls the same entry point a person does.
 *
 *   node scripts/audit/run.mjs rules      # collection rules, no browser
 *   node scripts/audit/run.mjs screens    # the app, in a real browser
 *   node scripts/audit/run.mjs all
 *
 * `screens` needs the app served and `BASE_URL` pointing at it. Both groups
 * need the PocketBase binary at deploy/pocketbase/.local/pocketbase.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const HERE = import.meta.dirname
const ROOT = path.resolve(HERE, '../..')

/**
 * What each group is for.
 *
 * `rules` asks the API what an account may fetch, from the receiving side, and
 * needs no app and no browser — a leak there does not need the front end to be
 * involved at all. `screens` drives the app as a person does.
 *
 * Split this way because they fail for different reasons and at different
 * speeds: a rules walk is seconds and a screens walk waits on real clocks.
 */
const GROUPS = {
  rules: [
    'house-gym-boundary',
    'menus-boundary',
    'gym-cap-boundary',
    'provisioning-boundary',
    'coach-cap',
    'open-door-boundary',
    'scheduled-boundary',
    'operators-boundary',
    'branding-boundary',
    'pro-boundary',
  ],
  screens: [
    'test-gate',
    'test-profiles',
    'test-session',
    'test-onboarding',
    'test-gym-flow',
    'test-banner-menu',
    'test-open-door',
    'test-scheduled',
    'test-operators',
    'test-branding',
    'test-enterprise-apply',
    'test-enterprise-rooms',
    'gym-programme-boundary',
    'aurora-contrast',
    'a11y-sweep',
    'verify-all',
    'walk',
  ],
}

const group = process.argv[2] ?? 'all'
const names =
  group === 'all' ? [...GROUPS.rules, ...GROUPS.screens] : GROUPS[group]

if (!names) {
  console.error(`Unknown group "${group}". Try: rules, screens, all.`)
  process.exit(2)
}

/* Said before anything runs, because "cannot find the binary" arriving as a
   walk failure sends somebody looking in the wrong place entirely. */
const binary = path.join(ROOT, 'deploy/pocketbase/.local/pocketbase')
if (!existsSync(binary)) {
  console.error(`No PocketBase binary at ${binary}.`)
  console.error('The walks that check collection rules boot one from this repo’s own migrations.')
  process.exit(2)
}

const run = (name) =>
  new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('node', [path.join(HERE, `${name}.mjs`)], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let output = ''
    child.stdout.on('data', (d) => (output += d))
    child.stderr.on('data', (d) => (output += d))
    child.on('exit', (code) => {
      resolve({ name, ok: code === 0, seconds: Math.round((Date.now() - started) / 1000), output })
    })
  })

console.log(`\n${names.length} walks in "${group}"\n`)

const results = []
for (const name of names) {
  process.stdout.write(`${name.padEnd(26)} `)
  const result = await run(name)
  results.push(result)
  console.log(`${result.ok ? 'pass' : 'FAIL'}  ${result.seconds}s`)
}

/* Only the failures, and all of their output: a passing walk's log is noise,
   and a failing one is the only thing anybody is going to read. */
const failed = results.filter((r) => !r.ok)
for (const result of failed) {
  console.log(`\n${'—'.repeat(60)}\n${result.name}\n${'—'.repeat(60)}`)
  console.log(result.output.trimEnd())
}

const total = results.reduce((n, r) => n + r.seconds, 0)
console.log(
  `\n${results.length - failed.length}/${results.length} passed in ${total}s` +
    (failed.length > 0 ? `; failed: ${failed.map((r) => r.name).join(', ')}` : ''),
)
process.exit(failed.length === 0 ? 0 : 1)
