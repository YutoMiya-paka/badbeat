const { test, expect } = require('@playwright/test');

test('起動すると見本の判定が出る', async ({ page }) => {
  // 記録の送信は本番シートに行かないよう止める
  await page.route('https://script.google.com/**', r => r.fulfill({ status: 200, body: 'ok' }));
  await page.goto('/');
  await expect(page.locator('.v-title').first()).toBeVisible();
});
