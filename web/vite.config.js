import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: '/quest3-bounce/',
  plugins: [wasm()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'esnext',
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
