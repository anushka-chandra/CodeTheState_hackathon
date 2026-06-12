import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev with HMR + real extraction: run `vercel dev` (functions on
    // :3000) alongside `npm run dev`, and /api is proxied to it. If nothing is
    // listening there, the request fails and the app falls back to the cached
    // example — never a broken screen.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
