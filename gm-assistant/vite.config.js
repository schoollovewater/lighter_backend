import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/gm/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../public/gm',
    emptyOutDir: true,
  },
})
