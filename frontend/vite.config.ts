import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5175,
    proxy: {
      // RUCKUS One API proxies (same as r1helper)
      '/r1': {
        target: 'https://api.ruckus.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/r1/, ''),
        headers: {
          origin: 'https://api.ruckus.cloud',
        },
        configure: (proxy: any) => {
          proxy.on('proxyReq', (proxyReq: any) => {
            try { proxyReq.removeHeader('origin') } catch {}
            try { proxyReq.removeHeader('referer') } catch {}
          })
        },
      },
      '/r1-eu': {
        target: 'https://api.eu.ruckus.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/r1-eu/, ''),
        headers: {
          origin: 'https://api.eu.ruckus.cloud',
        },
        configure: (proxy: any) => {
          proxy.on('proxyReq', (proxyReq: any) => {
            try { proxyReq.removeHeader('origin') } catch {}
            try { proxyReq.removeHeader('referer') } catch {}
          })
        },
      },
      '/r1-asia': {
        target: 'https://api.asia.ruckus.cloud',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/r1-asia/, ''),
        headers: {
          origin: 'https://api.asia.ruckus.cloud',
        },
        configure: (proxy: any) => {
          proxy.on('proxyReq', (proxyReq: any) => {
            try { proxyReq.removeHeader('origin') } catch {}
            try { proxyReq.removeHeader('referer') } catch {}
          })
        },
      },
      // Netlify Functions proxy (for SmartZone)
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
        rewrite: (path) => path, // Keep the path as-is
      },
    },
  },
})
