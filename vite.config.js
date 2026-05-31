import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'LC1 Village IMS — Ministry of Local Government',
        short_name: 'LC1 VIMS',
        description: 'Uganda Ministry of Local Government — LC1 Village Information Management System. Manage residents, cases, births, deaths, and village records. Works fully offline.',
        theme_color: '#004d00',
        background_color: '#0d1b14',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en-UG',
        categories: ['government', 'productivity', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ],
        shortcuts: [
          { name: 'Register Resident', url: '/residents/new', description: 'Register a new resident' },
          { name: 'Dashboard',         url: '/',              description: 'View village dashboard'  },
          { name: 'Reports',           url: '/reports',       description: 'View analytics and reports' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.africastalking\.com\/.*/i,
            handler: 'NetworkOnly',  // SMS always needs network — never cache
          }
        ],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
      devOptions: {
        enabled: true,   // Enable PWA in dev mode for testing
      }
    })
  ]
})
