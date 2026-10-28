import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // CodeSandbox serves the dev and preview servers from *.csb.app, which Vite
  // blocks by default. Its tasks also pass --host so the preview can connect.
  server: { allowedHosts: ['.csb.app'] },
  preview: { allowedHosts: ['.csb.app'] },
  test: {
    setupFiles: ['./src/test/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/test/**', 'src/**/*.test.*'],
    },
  },
})
