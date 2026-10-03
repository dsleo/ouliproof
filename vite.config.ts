import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { spawn, type ChildProcess } from 'node:child_process'

function localDatasetApi() {
  return {
    name: 'local-dataset-api',
    apply: (_config: unknown, environment: { command: string }) => environment.command === 'serve' && !process.env.VITEST,
    configureServer(server: { httpServer: { on: (event: string, listener: () => void) => void } | null; config: { logger: { warn: (message: string) => void } } }) {
      let child: ChildProcess | null = null
      let checking = false
      const check = async () => {
        if (checking || (child && child.exitCode === null && child.signalCode === null)) return
        checking = true
        try {
          const response = await fetch('http://127.0.0.1:5188/seed-api/stats', { signal: AbortSignal.timeout(1000) })
          if (response.ok) return
        } catch { /* Start the local API below. */ }
        finally { checking = false }
        child = spawn('python3', ['scripts/serve_seed_dataset.py'], { cwd: process.cwd(), stdio: 'ignore' })
        child.on('error', (error) => server.config.logger.warn(`Dataset API could not start: ${error.message}`))
      }
      void check()
      const timer = setInterval(() => { void check() }, 3000)
      server.httpServer?.on('close', () => { clearInterval(timer); child?.kill() })
    },
  }
}

export default defineConfig({
  plugins: [react(), localDatasetApi()],
  server: {
    proxy: {
      '/seed-api': {
        target: 'http://127.0.0.1:5188',
        changeOrigin: true,
      },
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
