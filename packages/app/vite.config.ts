import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Betel Info',
        short_name: 'Betel',
        description: 'Informații și evenimente — Biserica Baptistă Betel Cluj-Napoca',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Admin is lazy-loaded and only needed by editors; keep it out of every visitor's precache.
        globIgnores: ['**/AdminApp-*.js'],
        // Server-only routes (specs 02, 03): never answer them with the app shell. Workbox
        // matches pathname + search, so the feed patterns allow a query (?lang=).
        navigateFallbackDenylist: [
          /^\/admin/,
          /^\/s\//,
          /^\/robots\.txt$/,
          /^\/sitemap\.xml$/,
          /^\/feed\.xml(?:\?|$)/,
          /^\/[^/]+\/feed\.xml(?:\?|$)/,
          /^\/llms\.txt(?:\?|$)/,
        ],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.method === 'GET' && request.url.includes('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: { maxAgeSeconds: 60 * 5 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Everything the API serves outside the SPA.
    proxy: Object.fromEntries(
      [
        // Routes, media, short links
        '/api', '/uploads', '/s/',
        // Crawler endpoints (spec 03)
        '/robots.txt', '/sitemap.xml',
        // Event feeds and the agent index (spec 02): /feed.xml, /:siteSlug/feed.xml, /llms.txt
        '^/([^/]+/)?feed\\.xml(\\?|$)', '/llms.txt',
      ].map(prefix => [prefix, {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      }]),
    ),
  },
})
