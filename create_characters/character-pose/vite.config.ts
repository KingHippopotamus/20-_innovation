import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/character_generator/",
  server: {
    proxy: {
      '/api': {
        target: 'https://ony6iblvbk.execute-api.ap-northeast-1.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/1'),
      },
    },
  },
})
