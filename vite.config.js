import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/fotmob': {
        target: 'https://www.fotmob.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/fotmob/, ''),
        headers: { 'User-Agent': 'Mozilla/5.0 Chrome/126.0' },
      },
    },
  },
})
