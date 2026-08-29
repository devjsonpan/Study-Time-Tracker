import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // Tailwind v4 runs as a Vite plugin — no separate PostCSS config needed
  ],
  // Proxy API calls to the Flask backend during development.
  // Any request to /api/... gets forwarded to Flask on port 5000.
  // This avoids CORS issues and means the frontend doesn't need to know Flask's URL.
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: false,  // keep the original host header so Flask's session cookies match
      },
      // Flask's Google OAuth verification endpoint — not under /api/ so must be listed explicitly
      '/auth/verify': {
        target: 'http://localhost:5000',
        changeOrigin: false,
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        changeOrigin: false,
        ws: true,   // ← enables WebSocket proxying, not just HTTP
      }
    },
  },
})
