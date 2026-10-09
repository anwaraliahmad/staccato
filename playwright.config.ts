import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // Software WebGL compiles three programs per shader edit; give it room.
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:4173/',
    viewport: { width: 1280, height: 760 },
    launchOptions: {
      // Software WebGL2 in CI, and let the demo make sound without a click.
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
    },
  },
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
});
