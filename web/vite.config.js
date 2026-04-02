import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';

function versionStamp() {
  return {
    name: 'version-stamp',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ v: Date.now().toString(36) }),
      });
    },
    configureServer(server) {
      // Serve a live version.json in dev mode (changes on each request for testing)
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ v: 'dev' }));
      });
    },
  };
}

export default defineConfig({
  base: '/quest3-bounce/',
  plugins: [wasm(), versionStamp()],
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
