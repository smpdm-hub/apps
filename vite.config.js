import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://github.com/smpdm-hub/apps
export default defineConfig({
  plugins: [react()],
  // Jika deploy ke Github Pages, base URL harus sesuai dengan nama repository
  // Hapus baris base ini jika deploy ke Vercel atau root domain
  base: './', 
  build: {
    target: 'esnext'
  },
  esbuild: {
    target: 'esnext'
  }
})
