import { defineConfig } from 'vite'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    legacy({
      targets: ['defaults', 'not IE 11']
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          stats: ['stats.js']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['three', 'stats.js']
  }
})