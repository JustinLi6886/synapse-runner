import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  optimizeDeps: {
    force: false,
    // No include list — let Vite discover deps
  },
  server: {
    port: 3000,
    strictPort: false,
    open: true,
    host: '127.0.0.1',
    hmr: { overlay: true },
  },
})
