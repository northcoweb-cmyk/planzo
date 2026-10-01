/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Relative base so the app works from any sub-path (GitHub Pages, a NAS, file server...).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png', 'viewer/*.html', 'hero/*.webp'],
      manifest: {
        name: 'BMW Garage',
        short_name: 'BMW Garage',
        description: 'Personal BMW ownership dashboard: mileage, fuel, maintenance, service history, mods and a 3D X3.',
        theme_color: '#07080a',
        background_color: '#07080a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: './',
        scope: './',
        categories: ['utilities', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          { name: 'Add Fuel', url: './#/add/fuel', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Add Service', url: './#/add/service', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: '3D Car', url: './#/car/3d', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] }
        ]
      },
      workbox: {
        // Precache the app shell AND the 3D viewer so everything works offline.
        globPatterns: ['**/*.{js,css,html,png,webp,svg,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: 'index.html',
        // the 3D viewer is a separate precached page opened with ?embed=1 – match it ignoring the query and never fall back to the app shell
        ignoreURLParametersMatching: [/.*/],
        navigateFallbackDenylist: [/\/viewer\//],
        // Never cache the optional online VIN decoder
        runtimeCaching: [{ urlPattern: /^https:\/\/vpic\.nhtsa\.dot\.gov\//, handler: 'NetworkOnly' }]
      }
    })
  ],
  build: { target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 700 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
})
