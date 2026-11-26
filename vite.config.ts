import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'og-image.png'],
      manifest: {
        name: 'Tài liệu PDF — Cắt gộp, tách file & chuyển Word',
        short_name: 'Tài liệu PDF',
        description: 'Cắt, gộp, tách PDF, xuất ảnh gửi Zalo và chuyển PDF ↔ Word cho dạy học.',
        theme_color: '#f2f2f6',
        background_color: '#e8e8ed',
        display: 'standalone',
        lang: 'vi',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,woff2,mjs}'],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 3 },
            { name: 'motion-vendor', test: /node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/, priority: 3 },
            { name: 'pdf-vendor', test: /node_modules[\\/]pdf-lib[\\/]/, priority: 2 },
            {
              name: 'word-vendor',
              test: /node_modules[\\/](docx-preview|mammoth|html2pdf\.js|jspdf|html2canvas|dompurify)[\\/]/,
              priority: 2,
            },
            {
              name: 'docx-vendor',
              test: /node_modules[\\/](markdown-docx|docx|katex|marked|fast-xml-parser)[\\/]/,
              priority: 2,
            },
            {
              name: 'zip-vendor',
              test: /node_modules[\\/]fflate[\\/]/,
              priority: 2,
            },
            {
              name: 'convert-vendor',
              test: /node_modules[\\/]pdfjs-dist[\\/]/,
              priority: 2,
            },
          ],
        },
      },
    },
  },
})
