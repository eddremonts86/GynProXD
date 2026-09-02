/**
 * A sandbox sync server that stays up until it is told to stop.
 *
 * The screens walks run against `vite preview`, whose /pb proxy forwards to
 * whatever POCKETBASE_URL names. On a laptop that is usually a PocketBase left
 * running from development; in CI nothing listens there, the proxy answers 502,
 * and the two walks that collect console errors fail on a harness assumption
 * rather than on the product. This gives CI the same thing the laptop had, from
 * this branch's own migrations and hooks.
 *
 *   node scripts/audit/sandbox-serve.mjs --port 8790 &
 *   POCKETBASE_URL=http://127.0.0.1:8790 pnpm exec vite preview
 *
 * Prints the URL on its own line once the server answers, exits on SIGINT or
 * SIGTERM, and takes its temp directory with it.
 */
import { startSandbox } from './pb-sandbox.mjs'

const flag = process.argv.indexOf('--port')
const port = flag > -1 ? Number(process.argv[flag + 1]) : undefined

const pb = await startSandbox(port ? { port } : {})
console.log(pb.base)

const stop = async () => {
  await pb.stop()
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
/* Nothing else keeps the loop alive: the server is a child with ignored stdio. */
setInterval(() => {}, 1 << 30)
