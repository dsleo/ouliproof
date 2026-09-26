import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/tg': {
        target: 'https://api.theoremsearch.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tg/, ''),
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
