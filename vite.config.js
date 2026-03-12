import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild',
    cssCodeSplit: false,
  },
  
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: false,
    proxy: {
      '/ws': {
        target: 'ws://localhost:18789',
        ws: true,
        changeOrigin: true,
      },
      '/v1/gateway': {
        target: 'http://localhost:18789',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:18788',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:18788',
        changeOrigin: true,
      },
    },
  },
  
  css: {
    devSourcemap: true,
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'assets/js'),
    },
  },
});
