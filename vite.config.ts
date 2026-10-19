import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages serves the app from /audit-app/
  base: '/audit-app/',
  define: {
    __APP_VERSION__: JSON.stringify('1.0'),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Training System Audit',
        short_name: 'Audit',
        description: 'Offline training and competence system audit',
        theme_color: '#0B2545',
        background_color: '#0B2545',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/audit-app/',
        scope: '/audit-app/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache every built file so the whole app works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2,ttf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 2500 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
