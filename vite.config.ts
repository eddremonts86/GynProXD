import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// 3015 is the documented default for humans and the audit scripts, but an
// agent-managed run can hand us a free port through PORT so parallel sessions
// do not collide. strictPort stays on: fail loudly rather than drift silently.
const PORT = Number(process.env.PORT) || 3015

export default defineConfig({
  server: {
    port: PORT,
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: PORT,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Forma',
        short_name: 'Forma',
        description: 'Plan, train and track offline. Your data stays in this browser.',
        theme_color: '#f2f3f5',
        background_color: '#f2f3f5',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}', 'favicon.svg', 'pwa-*.png', 'apple-touch-icon.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/repdb/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'movement-artwork',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Movements without local artwork fall back to dataset photos, which
            // stay available offline once they have been looked at.
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'movement-photos',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // The service worker only earns its keep in a real build; in dev it just
      // fights HMR and floods the console with registration failures.
      devOptions: { enabled: false },
    }),
  ],
})
