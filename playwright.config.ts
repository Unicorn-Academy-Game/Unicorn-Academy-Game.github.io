import { defineConfig, devices } from '@playwright/test';
import { ORIGIN, PORT } from './tools/qa/origin';

const webgl = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  webServer: {
    command: `pnpm exec vite --port ${PORT} --strictPort`,
    url: `${ORIGIN}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    // A landscape phone: the device the game is tuned for. Drawn at 1x because software WebGL is
    // slow; the hidpi project below is for looking at the pixels.
    { name: 'phone', use: { ...devices['Pixel 7 landscape'], deviceScaleFactor: 1, launchOptions: { args: webgl } } },
    { name: 'phone-hidpi', use: { ...devices['Pixel 7 landscape'], launchOptions: { args: webgl } } },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, launchOptions: { args: webgl } },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1180, height: 700 } } },
  ],
});
