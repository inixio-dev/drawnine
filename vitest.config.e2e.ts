import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  // Resolves the @drawnine/* path aliases declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    root: './',
    include: ['apps/api/test/**/*.e2e-spec.ts'],
  },
});
