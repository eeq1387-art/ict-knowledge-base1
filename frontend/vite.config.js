import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        headers: { origin: 'http://localhost:5173' },
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
