/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    proxy: {
      // Proxy gRPC-web requests to the backend server
      '/mitmflow.v1.Service': {
        target: 'http://localhost:50051',
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setup.ts',
  },
  resolve: {

  },
  optimizeDeps: {
    include: [
      '@bufbuild/protobuf/wkt',
    ],
  },
})