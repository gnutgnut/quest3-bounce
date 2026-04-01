#!/bin/bash
set -e

echo "=== Building Rust WASM ==="
cd crate
wasm-pack build --target web --out-dir ../web/pkg
cd ..

echo "=== Installing JS deps ==="
cd web
npm install

echo "=== Building for production ==="
npx vite build --outDir ../dist
cd ..

echo "=== Done! Output in dist/ ==="
