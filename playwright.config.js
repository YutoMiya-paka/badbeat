// 画面の自動テスト（Playwright）。実行: npm run test:e2e
// ブラウザは node_modules の中（npm run setup で入れる）を使う
process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
const { defineConfig, devices } = require('@playwright/test');

const PORT = 5190;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:' + PORT,
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node tools/serve.js',
    env: { PORT: String(PORT) },
    url: 'http://localhost:' + PORT,
    reuseExistingServer: false
  },
  projects: [
    { name: 'chromium-phone', use: Object.assign({}, devices['Pixel 7'], { viewport: { width: 375, height: 812 } }) },
    { name: 'webkit-iphone', use: Object.assign({}, devices['iPhone 14']) },
    { name: 'chromium-desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } }
  ]
});
