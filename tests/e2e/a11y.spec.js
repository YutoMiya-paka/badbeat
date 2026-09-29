// アクセシビリティの自動化できる部分: ボタンの名前、aria-pressed / aria-checked / aria-live、キーボード操作、フォーカスの見え方。
const { test, expect } = require('@playwright/test');
const { openApp, judge, waitIdle, setTone } = require('./helpers');
test.describe.configure({ timeout: 120000 });

// 開いていなければカード欄を開く（1 ページで続けて確かめるため）
async function ensurePicker(page) {
  if (await page.locator('#picker').isHidden()) await page.locator('#pickerToggle').click();
  await expect(page.locator('#picker')).toBeVisible();
}

test('名前・aria の静的な確認: ボタンの名前、口調ボタン、場面の radio、aria-live、勝率バーの説明', async ({ page }) => {
  await openApp(page);
  await test.step('すべてのボタン・入力欄に名前がある（aria-label か文字）', async () => {
    await ensurePicker(page); // カード欄の中身も対象に
    const bad = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('button, input, [role=radio]').forEach(el => {
        const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim();
        if (!name) out.push(el.id || el.className || el.tagName);
      });
      return out;
    });
    expect(bad, '名前の無いボタン').toEqual([]);
  });

  await test.step('主要な部品の名前: 送信・カード・入力欄・口調・このページについて・閉じる・クリア・判定する', async () => {
    await setTone(page, 'rough');
    await expect(page.getByRole('button', { name: '送信' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'カード', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '負けたハンドを書く' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^口調を切り替える。現在は荒め$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'このページについて' })).toBeVisible();
    await ensurePicker(page);
    await expect(page.getByRole('button', { name: 'クリア' })).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する' })).toBeVisible();
    for (const n of ['自分 1枚目', '自分 2枚目', '相手 1枚目', '相手 2枚目', 'フロップ 1枚目', 'フロップ 2枚目', 'フロップ 3枚目', 'ターン', 'リバー']) {
      await expect(page.getByRole('button', { name: n, exact: true })).toBeVisible();
    }
    for (const n of ['スペード', 'ハート', 'ダイヤ', 'クラブ']) await expect(page.getByRole('button', { name: n })).toBeVisible();
    await page.locator('#aboutOpen').click();
    await expect(page.getByRole('dialog', { name: 'このページについて' })).toBeVisible();
    await expect(page.getByRole('button', { name: '閉じる' })).toHaveCount(2); // 右上の × と下の「閉じる」
    await page.locator('#aboutX').click();
  });

  await test.step('口調ボタンの aria-pressed と aria-label が切り替えに合わせて変わる', async () => {
    await setTone(page, 'rough');
    const t = page.locator('#toneToggle');
    await expect(t).toHaveAttribute('aria-pressed', 'false');
    await expect(t).toHaveAttribute('aria-label', '口調を切り替える。現在は荒め');
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(t).toHaveAttribute('aria-label', '口調を切り替える。現在はやさしめ');
  });

  await test.step('場面の切り替えは radiogroup（名前つき）と 3 つの radio。aria-checked は常に 1 つだけ true', async () => {
    await setTone(page, 'rough');
    await ensurePicker(page);
    await expect(page.getByRole('radiogroup', { name: 'オールインした場面' })).toBeVisible();
    const radios = page.getByRole('radio');
    await expect(radios).toHaveCount(3);
    for (const id of ['st-0', 'st-3', 'st-4']) {
      await page.locator('#' + id).click();
      const states = await radios.evaluateAll(els => els.map(e => e.getAttribute('aria-checked')));
      expect(states.filter(s => s === 'true')).toHaveLength(1);
      await expect(page.locator('#' + id)).toHaveAttribute('aria-checked', 'true');
    }
  });

  await test.step('会話ログは aria-live（polite）、カード欄のエラーは role=status、カード欄・ダイアログに名前がある', async () => {
    await setTone(page, 'rough');
    await expect(page.locator('#log')).toHaveAttribute('aria-live', 'polite');
    await expect(page.locator('#pkError')).toHaveAttribute('role', 'status');
    await expect(page.locator('#picker')).toHaveAttribute('aria-label', 'カードで入力');
    await expect(page.locator('#about')).toHaveAttribute('aria-labelledby', 'aboutTitle');
    await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-controls', 'picker');
    await expect(page.locator('#aboutOpen')).toHaveAttribute('aria-haspopup', 'dialog');
    // 新しい返事は aria-live の領域（#log）の中に追加される
    const inside = await page.evaluate(() => document.getElementById('log').contains(document.querySelector('.verdict')));
    expect(inside).toBe(true);
  });

  await test.step('勝率のバーには読み上げ用の説明（role=img と aria-label）がある', async () => {
    await setTone(page, 'rough');
    const bar = page.locator('.verdict').first().locator('.bar');
    await expect(bar).toHaveAttribute('role', 'img');
    await expect(bar).toHaveAttribute('aria-label', /^自分 \d+\.\d%、相手 \d+\.\d%$/);
  });
});

test('Tab キーでフォーカスが順に移る（口調 → 説明 → … → カード → 入力欄 → 送信）', async ({ page }) => {
  await openApp(page);
  const seen = [];
  await page.locator('.top h1').evaluate(() => { document.body.focus(); });
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName + '.' + a.className) : ''; });
    seen.push(id);
    if (id === 'send') break;
  }
  const idx = id => seen.indexOf(id);
  for (const id of ['toneToggle', 'aboutOpen', 'pickerToggle', 'msg', 'send']) expect(idx(id), id + ' にフォーカスが届く: ' + seen.join(' > ')).toBeGreaterThanOrEqual(0);
  expect(idx('toneToggle')).toBeLessThan(idx('aboutOpen'));
  expect(idx('aboutOpen')).toBeLessThan(idx('pickerToggle'));
  expect(idx('pickerToggle')).toBeLessThan(idx('msg'));
  expect(idx('msg')).toBeLessThan(idx('send'));
  // 入力例のボタンにも Tab で届く
  expect(seen.some(s => s.startsWith('BUTTON.ex'))).toBe(true);
});

test('キーボードだけで: 入力して Enter で送信、口調の切り替え、くわしく見る、ダイアログを開いて Esc で閉じる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.locator('#msg').focus();
  await page.keyboard.type('AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 2);
  await waitIdle(page);
  await expect(page.locator('.verdict').last().locator('.v-title')).toHaveText('本物のバッドビート');
  // 口調ボタン: Space / Enter で切り替わる
  await page.locator('#toneToggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toneToggle')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Space');
  await expect(page.locator('#toneToggle')).toHaveAttribute('aria-pressed', 'false');
  // くわしく見る（summary）: Enter で閉じて、また開く
  const d = page.locator('.verdict').last().locator('details');
  await expect(d).toHaveAttribute('open', '');
  await d.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(d).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(d).toHaveAttribute('open', '');
  // ダイアログ: Enter で開き、Esc で閉じる。閉じたあとフォーカスは説明ボタンに戻る
  await page.locator('#aboutOpen').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#about')).toBeVisible();
  const inDialog = await page.evaluate(() => document.getElementById('about').contains(document.activeElement));
  expect(inDialog, 'ダイアログを開くとフォーカスがダイアログの中に移る').toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#about')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('aboutOpen');
});

test('キーボードでカード選択: 数字 → マーク → 判定（Enter）まで操作できる', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.locator('#pickerToggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#picker')).toBeVisible();
  const pick = async (r, s) => {
    await page.locator('#rk-' + r).focus(); await page.keyboard.press('Enter');
    await page.locator('#su-' + s).focus(); await page.keyboard.press('Enter');
  };
  await pick(12, 0); await pick(12, 1); await pick(11, 2); await pick(11, 3);
  await page.locator('#pkJudge').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 2);
  await expect(page.locator('.verdict').last().locator('.v-title')).toHaveText('バッドビート');
});

test('フォーカスが見える（キーボードで移ったボタンと入力欄に 2px の輪郭）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  for (const id of ['toneToggle', 'aboutOpen', 'pickerToggle', 'send', 'msg']) {
    await page.locator('#' + id).focus();
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab'); // キーボードで移った扱いにする
    const o = await page.evaluate(i => { const s = getComputedStyle(document.getElementById(i)); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; }, id);
    expect(o.style, id + ' の輪郭').not.toBe('none');
    expect(o.width, id + ' の輪郭の太さ').toBeGreaterThanOrEqual(2);
  }
});
