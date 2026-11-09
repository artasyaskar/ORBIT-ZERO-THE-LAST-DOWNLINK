import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { rmSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/**
 * Vite copies public/ verbatim (ignoring .gitignore); keep raw source models out of deployments. The two NASA
 * CubeSat GLBs are reference files only: the game's CubeSat is procedural (createOrbitZeroCubeSatAsset).
 */
const excludeIncomingSources = (): Plugin => ({
  name: 'orbit-zero-exclude-incoming-sources',
  apply: 'build',
  closeBundle() {
    rmSync('dist/assets/models/incoming', { recursive: true, force: true });
    for (const file of ['nasa-cubesat-icecube.glb', 'nasa-cubesat-mirata.glb']) {
      rmSync(`dist/assets/models/${file}`, { force: true });
    }
  },
});

export default defineConfig({
  plugins: [iwsdkDev(), excludeIncomingSources()],
  server: { host: '0.0.0.0', port: 8081, open: false },
  preview: { host: '0.0.0.0', port: 8081 },
  build: {
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV !== 'production',
    target: 'esnext',
    rollupOptions: { input: './index.html' },
  },
  esbuild: { target: 'esnext' },
  // @drawcall/uikitml otherwise pulls a second three/@pmndrs/uikit graph
  // (three@0.185 vs app super-three@0.181). Duplicate Component classes break
  // instanceof checks -> "Only pmndrs/uikit components can be added as children".
  resolve: {
    dedupe: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
    ],
  },
  optimizeDeps: {
    exclude: ['@babylonjs/havok'],
    include: [
      'three',
      '@pmndrs/uikit',
      '@pmndrs/uikit-horizon',
      '@pmndrs/uikit-lucide',
      '@drawcall/uikitml',
    ],
    esbuildOptions: { target: 'esnext' },
  },
  publicDir: 'public',
  base: './',
});
