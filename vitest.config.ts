import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  // Resolves the @drawnine/* path aliases declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  plugins: [
    // SWC instead of esbuild so Nest decorators and emitDecoratorMetadata work.
    swc.vite({ module: { type: 'es6' } }),
  ],
  test: {
    root: './',
    include: ['{apps,libs}/*/test/**/*.spec.ts'],
    coverage: {
      include: ['{apps,libs}/*/src/**/*.ts'],
    },
  },
});
