import path from 'node:path'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 3015 is the documented default for humans and the audit scripts, but an
// agent-managed run can hand us a free port through PORT so parallel sessions
// do not collide. strictPort stays on: fail loudly rather than drift silently.
const PORT = Number(process.env.PORT) || 3015

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
   * Same arrangement for meal suggestions: the Spoonacular key is injected as
   * an x-api-key header on the server side of the proxy. TheMealDB needs no
   * key and allows CORS, so the dish of the day calls it directly.
   */
  const recipeProxy: Record<string, ProxyOptions> | undefined = env.SPOONACULAR_API_KEY
    ? {
        '/api/recipes/spoonacular': {
          target: 'https://api.spoonacular.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/recipes\/spoonacular/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', env.SPOONACULAR_API_KEY)
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
    /* Same-path shared fetches (phase 7). With a local key the direct proxies
       above win; without one, dev behaves like production and asks the sync
       server, which answers 503 honestly when it has no key either. */
    '/api/enforma': { target: pbTarget, changeOrigin: true },
    ...(env.MINIMAX_API_KEY ? {} : { '/api/minimax': { target: pbTarget, changeOrigin: true } }),
    ...(env.SPOONACULAR_API_KEY
      ? {}
      : { '/api/recipes': { target: pbTarget, changeOrigin: true } }),
  }

  const apiProxy = { ...pbProxy, ...(aiProxy ?? {}), ...(recipeProxy ?? {}) }

  return {
  define: {
    __AI_COACH__: JSON.stringify(Boolean(env.MINIMAX_API_KEY)),
    __AI_COACH_MODEL__: JSON.stringify(env.MINIMAX_MODEL || 'MiniMax-Text-01'),
    __RECIPE_SEARCH__: JSON.stringify(Boolean(env.SPOONACULAR_API_KEY)),
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
      registerType: 'autoUpdate',
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
      },
      // The service worker only earns its keep in a real build; in dev it just
      // fights HMR and floods the console with registration failures.
      devOptions: { enabled: false },
    }),
  ],
}
})
