import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/EL-Hadidy/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
})
