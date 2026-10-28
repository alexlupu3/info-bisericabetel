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
    proxy: {
      '/api': {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      },
      // Crawler endpoints served by the API (spec 03)
      '/robots.txt': {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      },
      '/sitemap.xml': {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      },
      // Event feeds and the agent index served by the API (spec 02): /feed.xml,
      // /:siteSlug/feed.xml and /llms.txt
      '^/([^/]+/)?feed\\.xml(\\?|$)': {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      },
      '/llms.txt': {
        target: process.env.API_TARGET ?? 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
})
