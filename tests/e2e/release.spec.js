// 公開環境相当: 送信ボタンが覆われていない、コンソールにエラーが無い、Google Fonts が読めなくても動く。
const { test, expect } = require('@playwright/test');
const { openApp, judge, ask, setTone } = require('./helpers');
test.describe.configure({ timeout: 120000 });

const topAtCenter = (page, id) => page.evaluate(i => {
  const el = document.getElementById(i), r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return !!top && (top === el || el.contains(top));
}, id);

test('回帰: 送信ボタンの中央の一番上の要素が送信ボタン自身（起動時・判定後・カード欄・ダイアログ後）。外から差し込まれたバッジが覆えばこの検査は落ちる', async ({ page }) => {
  await openApp(page);
  await test.step('回帰: 送信ボタンの中央の一番上の要素は送信ボタン自身（起動時・判定後・カード欄・ダイアログ後）', async () => {
    expect(await topAtCenter(page, 'send')).toBe(true);
    await judge(page, 'AA vs KK');
    expect(await topAtCenter(page, 'send')).toBe(true);
    await page.locator('#pickerToggle').click();
    expect(await topAtCenter(page, 'send')).toBe(true);
    await page.locator('#aboutOpen').click();
    await page.locator('#aboutX').click();
    expect(await topAtCenter(page, 'send')).toBe(true);
    // 主なボタンも同様
    for (const id of ['pickerToggle', 'toneToggle', 'aboutOpen', 'msg']) expect(await topAtCenter(page, id), id).toBe(true);
  });

  await test.step('確認のための確認: 外から差し込まれたバッジが送信ボタンを覆えば、この検査は落ちる', async () => {
    await setTone(page, 'rough');
    await page.evaluate(() => {
      const b = document.getElementById('send').getBoundingClientRect();
      const d = document.createElement('div');
      d.id = 'fake-badge';
      d.style.cssText = 'position:fixed;z-index:99999;left:' + (b.left - 5) + 'px;top:' + (b.top - 5) + 'px;width:' + (b.width + 10) + 'px;height:' + (b.height + 10) + 'px;background:red';
      document.body.appendChild(d);
    });
    expect(await topAtCenter(page, 'send')).toBe(false);
  });
});

test('コンソールにエラー・警告が出ない（起動・判定・1 日まとめ・カード欄・ダイアログ・口調・入力エラー）', async ({ page }) => {
  const problems = [];
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) problems.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  // 外部（Google Fonts）へは行かず、空の CSS を返す
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await openApp(page);
  await judge(page, 'AA vs KK');
  await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
  await ask(page, 'KKで3回負けた');
  await ask(page, '4回');
  await ask(page, 'ポケットペアで負けた');
  await ask(page, 'KKs vs AA');
  await ask(page, 'ありがとう');
  await page.locator('#pickerToggle').click();
  await page.locator('#rk-12').click();
  await page.locator('#su-0').click();
  await page.locator('#pkJudge').click();
  await page.locator('#pkClear').click();
  await page.locator('#aboutOpen').click();
  await page.locator('#aboutX').click();
  await page.locator('#toneToggle').click();
  await judge(page, 'KK vs AA');
  await page.locator('#toneToggle').click();
  expect(problems).toEqual([]);
});

test('Google Fonts が読めなくても（通信を止めても）判定ができ、代わりの書体で崩れず表示される', async ({ page }) => {
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, r => r.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await openApp(page);
  const v = await judge(page, 'AA vs KK');
  expect(v.title).toBe('バッドビート');
  await expect(page.locator('.verdict').last().locator('.v-title')).toBeVisible();
  await ask(page, 'KKで5回中3回負けた');
  await expect(page.locator('.luck')).toHaveCount(1);
  const m = await page.evaluate(() => ({
    docW: document.documentElement.scrollWidth, inner: window.innerWidth,
    family: getComputedStyle(document.body).fontFamily,
    loaded: document.fonts.check('16px "Zen Kaku Gothic New"')
  }));
  expect(m.docW).toBeLessThanOrEqual(m.inner);
  expect(m.family).toContain('Hiragino Sans'); // 代わりの書体の指定がある
  expect(m.family).toContain('Yu Gothic');
  expect(errors).toEqual([]);
  await expect(page.locator('#send')).toBeEnabled();
});

test('公開ページの基本: タイトル・言語・viewport・説明が設定されている', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle('バッドビート相談所');
  expect(await page.locator('html').getAttribute('lang')).toBe('ja');
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('width=device-width');
  expect(await page.locator('meta[name=description]').getAttribute('content')).toContain('バッドビート');
});
