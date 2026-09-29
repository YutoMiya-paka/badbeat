// スマホ操作（案A）: 入力欄に触るとカード欄が閉じて「カードで選ぶ」帯が出る／離れると消える／「カード」ボタンと帯のボタンでカード欄が開く。
// 実機のキーボードの出方までは再現できないので、ここで確かめるのは画面側の状態（表示・フォーカス・重なり）。
const { test, expect } = require('@playwright/test');
const { openApp, judge } = require('./helpers');
test.describe.configure({ timeout: 120000 });

test.beforeEach(async ({ isMobile }) => {
  test.skip(!isMobile, 'スマホ操作は PC 構成では意味がない（スマホ構成だけで確かめる）');
});

// 入力欄から離れる: 見出しを押す。WebKit（iPhone）は文字などの押せない所を押してもフォーカスが外れないので、blur を直接呼ぶ
async function leaveInput(page, browserName) {
  if (browserName === 'webkit') await page.locator('#msg').evaluate(el => el.blur());
  else await page.locator('.top h1').tap();
}
const cardbarShown = page => page.evaluate(() => { const c = document.getElementById('cardbar'); return !c.hidden && getComputedStyle(c).display !== 'none'; });
const focusedId = page => page.evaluate(() => document.activeElement && document.activeElement.id);
// 要素の中央に一番上で見えている要素が、その要素（か中身）か
const topAtCenter = (page, id) => page.evaluate(i => {
  const el = document.getElementById(i), r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === el || el.contains(top));
}, id);

test('入力欄を押すとカード欄が閉じ、「カードで選ぶ」帯が出る。離れると帯が消える', async ({ page, browserName }) => {
  await openApp(page);
  await page.locator('#pickerToggle').tap();
  await expect(page.locator('#picker')).toBeVisible();
  expect(await cardbarShown(page)).toBe(false);
  await page.locator('#msg').tap();
  expect(await focusedId(page)).toBe('msg');
  await expect(page.locator('#picker')).toBeHidden();
  await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#cardbar')).toBeVisible();
  await expect(page.locator('#cardbarBtn')).toHaveText('カードで選ぶ');
  await expect(page.locator('#cardbar')).toContainText('カード欄を開く');
  // 入力欄から離れると帯が消える
  await leaveInput(page, browserName);
  await expect(page.locator('#cardbar')).toBeHidden();
  expect(await focusedId(page)).not.toBe('msg');
});

test('帯の「カードで選ぶ」を押すと、入力欄のフォーカスが外れ、帯が消えてカード欄が開く', async ({ page }) => {
  await openApp(page);
  await page.locator('#msg').tap();
  await expect(page.locator('#cardbar')).toBeVisible();
  await page.locator('#cardbarBtn').click();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#cardbar')).toBeHidden();
  expect(await focusedId(page)).not.toBe('msg');
  await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-expanded', 'true');
});

test('帯の「カードで選ぶ」を指（タッチ）で押して開く', async ({ page, browserName }) => {
  test.fixme(browserName === 'webkit', '未解明（実機で要確認）: Playwright の WebKit（iPhone 構成）では、タッチの tap だとこのボタンの click が発火せずカード欄が開かない（touchend までは届く）。マウスの click では開く。他のボタン（「カード」）の tap は動く。pointerdown の preventDefault を外しても同じだった');
  await openApp(page);
  await page.locator('#msg').tap();
  await expect(page.locator('#cardbar')).toBeVisible();
  await page.locator('#cardbarBtn').tap();
  await expect(page.locator('#picker')).toBeVisible();
  await expect(page.locator('#cardbar')).toBeHidden();
});

test('「カード」ボタン: 押すたびにカード欄が開閉し、入力欄のフォーカスは外れる（キーボードとカード欄が同時に出ない）', async ({ page }) => {
  await openApp(page);
  await page.locator('#msg').tap();
  await expect(page.locator('#cardbar')).toBeVisible();
  await page.locator('#pickerToggle').tap();
  await expect(page.locator('#picker')).toBeVisible();
  expect(await focusedId(page)).not.toBe('msg');
  await expect(page.locator('#cardbar')).toBeHidden();
  await page.locator('#pickerToggle').tap();
  await expect(page.locator('#picker')).toBeHidden();
  // カード欄を開いたまま入力欄を押すと、カード欄が閉じる（同時に出ない）
  await page.locator('#pickerToggle').tap();
  await expect(page.locator('#picker')).toBeVisible();
  await page.locator('#msg').tap();
  await expect(page.locator('#picker')).toBeHidden();
  expect(await focusedId(page)).toBe('msg');
  // 状態が同時に成り立つことは一度もない
  const both = await page.evaluate(() => !document.getElementById('picker').hidden && document.activeElement === document.getElementById('msg'));
  expect(both).toBe(false);
});

test('送信ボタンは、通常時・帯が出ているとき・カード欄が開いているときのどれでも一番上にあって押せる', async ({ page }) => {
  await openApp(page);
  expect(await topAtCenter(page, 'send')).toBe(true);
  await page.locator('#msg').tap();
  await expect(page.locator('#cardbar')).toBeVisible();
  expect(await topAtCenter(page, 'send')).toBe(true);
  expect(await topAtCenter(page, 'msg')).toBe(true);
  await page.locator('#pickerToggle').tap();
  await expect(page.locator('#picker')).toBeVisible();
  expect(await topAtCenter(page, 'send')).toBe(true);
  expect(await topAtCenter(page, 'pickerToggle')).toBe(true);
});

test('帯が出た状態でも入力して送信できる（帯が送信を邪魔しない）', async ({ page }) => {
  await openApp(page);
  await page.locator('#msg').tap();
  await page.locator('#msg').fill('AA vs KK');
  await expect(page.locator('#cardbar')).toBeVisible();
  const box = await page.locator('#send').boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 2);
  await expect(page.locator('.verdict').last().locator('.v-title')).toHaveText('バッドビート');
  await expect(page.locator('#msg')).toHaveValue('');
});

test('帯とカード欄と入力欄が画面内に収まり、帯が見えるとき下端のボタンが画面外に出ない', async ({ page }) => {
  await openApp(page);
  await page.locator('#msg').tap();
  const m = await page.evaluate(() => {
    const vh = window.innerHeight, vw = window.innerWidth;
    const r = id => document.getElementById(id).getBoundingClientRect();
    return { vh, vw, cardbar: r('cardbar'), send: r('send'), msg: r('msg') };
  });
  for (const k of ['cardbar', 'send', 'msg']) {
    expect(m[k].bottom, k + ' の下端').toBeLessThanOrEqual(m.vh + 1);
    expect(m[k].top, k + ' の上端').toBeGreaterThanOrEqual(0);
    expect(m[k].right, k + ' の右端').toBeLessThanOrEqual(m.vw + 1);
  }
  expect(m.cardbar.bottom, '帯は入力欄の上').toBeLessThanOrEqual(m.msg.top + 1);
});

test('入力欄の文字は 16px 以上（iOS で押しても画面が拡大されない）', async ({ page }) => {
  await openApp(page);
  const fs = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('msg')).fontSize));
  expect(fs).toBeGreaterThanOrEqual(16);
});

test('カード欄を開いたあとでも、判定の結果カードの頭が見える位置にある', async ({ page }) => {
  await openApp(page);
  await page.locator('#pickerToggle').tap();
  await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
  await expect.poll(async () => page.evaluate(() => {
    const log = document.getElementById('log').getBoundingClientRect();
    const t = document.querySelectorAll('.verdict .v-title'); const r = t[t.length - 1].getBoundingClientRect();
    return r.top >= log.top - 1 && r.bottom <= log.bottom + 1;
  })).toBe(true);
});
