import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
              test: /node_modules[\\/](mammoth|html2pdf\.js|jspdf|html2canvas|dompurify)[\\/]/,
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
