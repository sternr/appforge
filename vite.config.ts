/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { createHash } from 'crypto'
import { writeFileSync } from 'fs'

/**
 * Generates a unique build version on each build and:
 * 1. Injects it as VITE_BUILD_VERSION env var (available at runtime)
 * 2. Writes version.json to dist/ (fetched by the auto-updater)
 */
function viteVersionPlugin(): Plugin {
  const version = createHash('md5')
    .update(Date.now().toString() + Math.random().toString())
    .digest('hex')
    .slice(0, 8)
    .toUpperCase()

  return {
    name: 'vite-version-plugin',
    config() {
      return {
        define: {
          'import.meta.env.VITE_BUILD_VERSION': JSON.stringify(version),
        },
      }
    },
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      writeFileSync(
        `${outDir}/version.json`,
        JSON.stringify({ version, buildTime: new Date().toISOString() }),
      )
    },
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  plugins: [
    viteVersionPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'AppForge',
        short_name: 'AppForge',
        description: 'Build apps with just a description',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: './icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Don't precache version.json — it must always be fetched fresh
        globIgnores: ['version.json'],
      },
    }),
    viteSingleFile(),
  ],
  base: './',
  server: {
    host: true,
    port: 5199,
  },
  build: {
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
})
