import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  build: {
    target: 'es2022',
    // Shaders are the point of the project: keep them readable in the bundle.
    minify: true,
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
