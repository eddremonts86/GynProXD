/**
 * A throwaway PocketBase, built from this repo's own migrations and hooks.
 *
 * Collection rules are a layer the unit tests cannot see: they decide what an
 * account may fetch straight off the API, and a leak there does not need the
 * app to be involved at all. Anything that wants to check one — or that needs a
 * real sync account, because half the panel is gated on a plan the server holds
 * — boots one of these, uses it, and throws it away.
 *
 *   const pb = await startSandbox()
 *   const gyms = await pb.api('GET', '/api/collections/gyms/records', undefined, pb.su)
 *   await pb.stop()
 *
 * Requires the PocketBase binary at deploy/pocketbase/.local/pocketbase, which
 * is where the local dev setup already puts it.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chmod, cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')
const BINARY = path.join(ROOT, 'deploy/pocketbase/.local/pocketbase')
const SUPER = { identity: 'probe@enforma.test', password: 'Sup3rSecret123' }

const run = (cmd, args) =>
  new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' })
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    p.on('error', reject)
  })

/**
 * A port nobody is using.
 *
 * The default used to be a fixed 8792, which is fine for one walk and a trap
 * for a sweep: five of them boot a sandbox now, and running them back to back
 * had one starting before the last one's port was free. It came out as
 * ECONNREFUSED from a server that never bound — a failure that says nothing
 * about the thing being tested and costs somebody an afternoon to place.
 */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

export async function startSandbox({ port } = {}) {
  const pinned = Number(process.env.PB_PROBE_PORT ?? 0)
  port = port ?? (pinned > 0 ? pinned : await freePort())
  const base = `http://127.0.0.1:${port}`
  const dir = await mkdtemp(path.join(tmpdir(), 'enforma-pb-'))
  const binary = path.join(dir, 'pocketbase')
  await cp(BINARY, binary)
  await chmod(binary, 0o755)
  for (const part of ['pb_migrations', 'pb_hooks']) {
    await cp(path.join(ROOT, 'deploy/pocketbase', part), path.join(dir, part), { recursive: true })
  }

  const data = path.join(dir, 'pb_data')
  await run(binary, ['superuser', 'upsert', SUPER.identity, SUPER.password, '--dir', data])

  /* `serve` re-applies pending migrations on start, which is the point: the
     sandbox is whatever this branch says the schema is. */
  const server = spawn(
    binary,
    ['serve', '--http', `127.0.0.1:${port}`, '--dir', data,
     '--hooksDir', path.join(dir, 'pb_hooks'), '--migrationsDir', path.join(dir, 'pb_migrations')],
    { stdio: 'ignore' },
  )

  const api = async (method, route, body, token) => {
    const res = await fetch(base + route, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { Authorization: token } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }

  for (let i = 0; i < 60; i++) {
    if (await fetch(`${base}/api/health`).then((r) => r.ok).catch(() => false)) break
    await new Promise((r) => setTimeout(r, 250))
  }
  const su = (await api('POST', '/api/collections/_superusers/auth-with-password', SUPER)).json.token
  if (!su) {
    server.kill()
    await rm(dir, { recursive: true, force: true })
    throw new Error('the sandbox server never came up')
  }

  const stop = async () => {
    server.kill()
    await rm(dir, { recursive: true, force: true })
  }

  /** The account a user opened through the app, found by the address they used. */
  const userByEmail = async (email) => {
    const list = await api('GET', '/api/collections/users/records?perPage=200', undefined, su)
    return list.json.items?.find((u) => u.email === email) ?? null
  }

  return { base, su, api, stop, userByEmail }
}
