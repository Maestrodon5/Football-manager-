import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'PitchMaster FC Manager',
          short_name: 'PitchMaster',
          description: 'Professional Football Club Management: Automated Weekly Lineups & Match Timers',
          theme_color: '#064e3b',
          background_color: '#020617',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/icon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable',
            },
          ],
        },
        // The installed PWA and website use the same origin, frontend build, and /api backend.
        // Never cache API responses: player, attendance, lineup, settings and replacement data
        // must always come from the shared server, not stale per-device service-worker storage.
        workbox: {
          globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
              handler: 'NetworkOnly',
              method: 'GET',
              options: { cacheName: 'pitchmaster-api-no-cache' },
            },
            {
              urlPattern: ({ request, url }) => request.mode === 'navigate' && url.origin === self.location.origin,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pitchmaster-navigation',
                networkTimeoutSeconds: 5,
                expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          enabled: false, // Keep dev fast and lightweight
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
