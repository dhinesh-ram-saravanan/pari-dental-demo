import { defineConfig } from '@playwright/test';

const live = process.env.BASE_URL;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: live || 'http://localhost:4173', viewport: { width: 1440, height: 900 }, acceptDownloads: true },
  webServer: live ? undefined : { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
});
