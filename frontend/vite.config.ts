/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the browser talks to this server only; /api/pm-api/* is forwarded to the FastAPI
// process (path kept as is, exactly like CloudFront does in production), so no CORS setup is needed.
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { '/api/pm-api': { target: apiTarget, changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
