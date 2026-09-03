import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 3015 is the documented default for humans and the audit scripts, but an
// agent-managed run can hand us a free port through PORT so parallel sessions
// do not collide. strictPort stays on: fail loudly rather than drift silently.
const PORT = Number(process.env.PORT) || 3015

/* The same rule the sync server uses, taken from the file the server loads
   rather than restated here. A build that carries its own key has to answer
   "whose hardware is this?" too, and two copies of that answer is how one of
   them ends up reassuring somebody wrongly.

   Read and evaluated rather than imported: PocketBase's runtime needs that
   file to be CommonJS, and this package is ESM, so neither `import` nor
   `createRequire` will load it. Taking the bytes is also the stricter
   arrangement — a local copy would keep building while the shipped one drifted. */
const coachHostModule = { exports: {} as { coachHostFor: (base: string) => 'self' | 'external' } }
new Function(
  'module',
  'exports',
  readFileSync(
    path.resolve(import.meta.dirname, 'deploy/pocketbase/pb_hooks/utils/coach_host.js'),
    'utf8',
  ),
)(coachHostModule, coachHostModule.exports)
const { coachHostFor } = coachHostModule.exports

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * The AI coach's key lives in .env.local (gitignored) and never reaches the
   * browser: the dev/preview server proxies /api/minimax and injects the
   * Authorization header on its side. Without a key the proxy is absent and
   * the app falls back to the deterministic generator.
   */
  const aiProxy: Record<string, ProxyOptions> | undefined = env.MINIMAX_API_KEY
    ? {
        '/api/minimax': {
          target: env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/minimax/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', `Bearer ${env.MINIMAX_API_KEY}`)
            })
          },
        },
      }
    : undefined

  /**
   * The sync server (PocketBase). In dev the app talks to /pb and the proxy
   * forwards to a local instance (deploy/pocketbase/.local, or wherever
   * POCKETBASE_URL points); in production the server address is whatever the
   * device has configured in Settings, so no key or URL is baked in here.
   */
  const pbTarget = env.POCKETBASE_URL || 'http://127.0.0.1:8090'
  const pbProxy: Record<string, ProxyOptions> = {
    '/pb': {
      target: pbTarget,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/pb/, ''),
    },
    /* Movement photos, first-party so blockers cannot eat cdn.jsdelivr.net
       (matches the production nginx /exercise-img proxy). */
    '/exercise-img': {
      target: 'https://cdn.jsdelivr.net',
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/exercise-img/, '/gh/yuhonas/free-exercise-db@main/exercises'),
    },
    /* Same-path shared fetches (phase 7). With a local key the direct proxy
       above wins; without one, dev behaves like production and asks the sync
       server, which answers 503 honestly when it has no key either. Recipes
       always take this path: the catalogue lives on the sync server. */
    '/api/enforma': { target: pbTarget, changeOrigin: true },
    ...(env.MINIMAX_API_KEY ? {} : { '/api/minimax': { target: pbTarget, changeOrigin: true } }),
  }

  const apiProxy = { ...pbProxy, ...(aiProxy ?? {}) }

  return {
  define: {
    __AI_COACH__: JSON.stringify(Boolean(env.MINIMAX_API_KEY)),
    __AI_COACH_MODEL__: JSON.stringify(env.MINIMAX_MODEL || 'MiniMax-Text-01'),
    __AI_COACH_HOST__: JSON.stringify(
      coachHostFor(env.MINIMAX_BASE_URL || 'https://api.minimaxi.chat/v1'),
    ),
  },
  server: {
    port: PORT,
    strictPort: true,
    host: '127.0.0.1',
    proxy: apiProxy,
  },
  preview: {
    port: PORT,
    strictPort: true,
    proxy: apiProxy,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // The Spanish text and MET layer is nearly a megabyte and reached only
          // through a dynamic import. Naming it first keeps the rule below from
          // folding it into the chunk every page already downloads.
          if (id.includes('src/data/exercise-details-generated')) return 'exercise-details'
          // Same deal for wger's descriptions: reached by a dynamic import only.
          if (id.includes('src/data/exercise-wger-text')) return 'exercise-wger-text'
          // Three numbers the landing page prints. Left to Rollup so quoting the
          // size of the library does not drag the whole library in behind it.
          if (id.includes('src/data/catalogue-stats')) return undefined
          // The movement dataset barely changes, so it gets its own long-lived chunk.
          if (id.includes('src/data/')) return 'exercise-data'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('@tanstack') || id.includes('zustand')) return 'vendor'
          if (id.includes('@phosphor-icons') || id.includes('node_modules/motion')) return 'ui'
          if (id.includes('@base-ui') || id.includes('class-variance-authority') || id.includes('clsx') || id.includes('tailwind-merge')) return 'primitives'
          return undefined
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      /* Phase 6 needs a real worker file for the push and notificationclick
         listeners, so generateSW became injectManifest; src/sw.ts recreates
         the precache and runtime-cache behaviour workbox generated before. */
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      /* The app owns the update: `prompt` leaves the new worker waiting so
         nothing swaps under a running page, and `injectRegister: null` stops
         the plugin injecting its own bare registration — src/lib/pwa-update.ts
         registers, polls for a new build and offers it. */
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'enForma',
        short_name: 'enForma',
        description: 'Plan, train and track offline. Your data stays in this browser.',
        theme_color: '#ecebe8',
        background_color: '#ecebe8',
        display: 'standalone',
        /* Prefer the most app-like container the platform offers, falling back
           to plain standalone. */
        display_override: ['standalone', 'minimal-ui'],
        /* Launch back into the running window instead of spawning a new one. */
        launch_handler: { client_mode: 'navigate-existing' },
        categories: ['health', 'fitness', 'sports'],
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,woff2}', 'favicon.svg', 'pwa-*.png', 'apple-touch-icon.png'],
        /* Nobody should pay a megabyte at install time for text they may never
           open. It caches at runtime, like the artwork does. */
        globIgnores: ['**/exercise-details-*.js', '**/exercise-wger-text-*.js'],
      },
      // The service worker only earns its keep in a real build; in dev it just
      // fights HMR and floods the console with registration failures.
      devOptions: { enabled: false },
    }),
  ],
  /**
   * The suite is this checkout's own `src`, and nothing else.
   *
   * Other sessions open git worktrees under `.claude/worktrees/`, each a full
   * copy of the repository with its own specs. Vitest globs the whole tree by
   * default, so `pnpm test` was quietly running 536 tests from another branch
   * alongside this one's: a gate that can fail for a change nobody here made,
   * and a green that says nothing about this branch.
   */
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', '.claude/**', 'dist/**'],
  },
}
})
