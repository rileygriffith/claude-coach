import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    proxy: {
      '/api':        'http://localhost:4218',
      '/strava':     'http://localhost:4218',
      '/logout':     'http://localhost:4218',
      '/onboarding': 'http://localhost:4218',
    }
  }
})
