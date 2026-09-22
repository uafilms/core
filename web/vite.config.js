import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // Збільшуємо ліміт попередження (опціонально, щоб не муляло очі, але краще робити чанкінг)
    chunkSizeWarningLimit: 1000, 
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Якщо файл з node_modules
          if (id.includes('node_modules')) {
            // Виносимо важкі бібліотеки окремо
            if (id.includes('jszip')) {
              return 'jszip';
            }
            if (id.includes('swiper')) {
              return 'swiper';
            }
            // Все інше (включно з react, mdui, lit) — у vendor,
            // щоб уникнути circular dependency між чанками
            return 'vendor';
          }
        }
      }
    }
  }
})