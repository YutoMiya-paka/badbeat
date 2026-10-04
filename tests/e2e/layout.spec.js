// 画面・レイアウト・テーマ: ダーク（OS 設定と data-theme）、幅 360/375/430、結果カードのスクロール、くわしく見る、このページについて。
const { test, expect } = require('@playwright/test');
const { openApp, judge, ask, setTone } = require('./helpers');
test.describe.configure({ timeout: 120000 });

const LIGHT_BG = 'rgb(233, 239, 235)';
const DARK_BG = 'rgb(11, 19, 16)';
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const bodyInk = page => page.evaluate(() => getComputedStyle(document.body).color);

test.describe('ライト（OS 設定）', () => {
  test.use({ colorScheme: 'light' });
  test('背景・文字色がライトの色。data-theme="dark" を付けるとダークになる', async ({ page }) => {
    await openApp(page);
    expect(await bodyBg(page)).toBe(LIGHT_BG);
    expect(await bodyInk(page)).toBe('rgb(21, 32, 27)');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await bodyInk(page)).toBe('rgb(230, 238, 233)');
  });
});

test.describe('ダーク（OS 設定）', () => {
  test.use({ colorScheme: 'dark' });
  test('OS 設定だけでダークになり、判定カードの面の色も変わる', async ({ page }) => {
    await openApp(page);
    expect(await bodyBg(page)).toBe(DARK_BG);
    expect(await bodyInk(page)).toBe('rgb(230, 238, 233)');
    const surface = await page.evaluate(() => getComputedStyle(document.querySelector('.composer')).backgroundColor);
    expect(surface).toBe('rgb(20, 33, 27)');
  });
  test('OS がダークでも data-theme="light" ならライトになる', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    expect(await bodyBg(page)).toBe(LIGHT_BG);
  });
});

// 文字色と背景のコントラスト比（WCAG）
async function contrasts(page, selectors) {
  return page.evaluate(sels => {
    const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const bgOf = el => {
      const stack = [];
      for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } }
      let base = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) base = blend(stack[i], base);
      return base;
    };
    const out = [];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (!el) { out.push({ sel, missing: true }); continue; }
      const fg = parse(getComputedStyle(el).color), bg = bgOf(el);
      const f = blend(fg, bg);
      const l1 = lum(f), l2 = lum(bg);
      out.push({ sel, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) });
    }
    return out;
  }, selectors);
}

for (const scheme of ['light', 'dark']) {
  test.describe('コントラスト（' + scheme + '）', () => {
    test.use({ colorScheme: scheme });
    test('見出し・チップ・セリフ・数字・補足が 4.5 以上（大きい文字は 3 以上）で読める', async ({ page }) => {
      await openApp(page);
      await ask(page, 'KKで5回中3回負けた');
      const big = ['.verdict .v-title', '.luck .luck-num'];
      const normal = ['.verdict .v-line', '.verdict .hn', '.verdict .vn', '.verdict .eq-count', '.verdict .trivia',
        '.luck .luck-label', '.day-item .di-tag', '.day-item .di-nums', '.day-item .di-tail', '.top h1', '#toneToggle', '#aboutOpen', '#logNotice', '#send', '#pickerToggle', '.row.bot .bubble', '.row.me .bubble'];
      const res = await contrasts(page, big.concat(normal));
      const bad = res.filter(r => !r.missing && r.ratio < (big.includes(r.sel) ? 3 : 4.5)).map(r => r.sel + '=' + r.ratio.toFixed(2));
      expect(res.filter(r => r.missing).map(r => r.sel), '見つからない要素').toEqual([]);
      expect(bad, '読みにくい組み合わせ').toEqual([]);
    });
    test('同情チップ（金色の背景）の文字が 4.5 以上', async ({ page }) => {
      await openApp(page); // 見本の判定は「バッドビート」（同情チップ）
      const [c] = await contrasts(page, ['.verdict .v-chip']);
      expect(c.ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
}

// ---------- 幅 ----------
for (const width of [360, 375, 430]) {
  test('幅 ' + width + 'px: 横スクロールが出ない・保存の案内・ボタンが切れない（結果・カード欄を出した状態でも）', async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);
    await ask(page, 'KKで5回中3回負けた、AKも8回中5回');
    await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
    await page.locator('#pickerToggle').click();
    await expect(page.locator('#picker')).toBeVisible();
    const m = await page.evaluate(() => {
      const de = document.documentElement, log = document.getElementById('log');
      const h1 = document.querySelector('.top h1');
      const rg = document.createRange(); rg.selectNodeContents(h1);
      const lines = new Set(Array.from(rg.getClientRects()).map(r => Math.round(r.top)));
      const rect = id => { const r = document.getElementById(id).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
      const top = document.querySelector('.top').getBoundingClientRect();
      const notice = document.getElementById('logNotice');
      const nr = notice.getBoundingClientRect();
      return {
        docW: de.scrollWidth, bodyW: document.body.scrollWidth, inner: window.innerWidth, logW: log.scrollWidth, logC: log.clientWidth,
        h1Lines: lines.size, headerH: top.height, tone: rect('toneToggle'), about: rect('aboutOpen'),
        noticeScroll: notice.scrollWidth, noticeClient: notice.clientWidth, noticeLeft: nr.left, noticeRight: nr.right, noticeH: nr.height,
        noticeMore: rect('logNoticeMore'),
        composer: rect('composer'), send: rect('send'), msg: rect('msg')
      };
    });
    expect(m.docW, '文書の横幅').toBeLessThanOrEqual(m.inner);
    expect(m.bodyW).toBeLessThanOrEqual(m.inner);
    expect(m.logW, '会話ログの横幅').toBeLessThanOrEqual(m.logC);
    expect(m.about.right, '説明ボタンが画面内').toBeLessThanOrEqual(m.inner);
    expect(m.tone.left).toBeGreaterThanOrEqual(0);
    expect(m.noticeScroll).toBeLessThanOrEqual(m.noticeClient);
    expect(m.noticeLeft).toBeGreaterThanOrEqual(0);
    expect(m.noticeRight).toBeLessThanOrEqual(m.inner);
    expect(m.noticeMore.right, '「詳しく」が切れない').toBeLessThanOrEqual(m.inner);
    expect(m.send.right, '送信ボタンが画面内').toBeLessThanOrEqual(m.inner);
    expect(m.msg.left).toBeGreaterThanOrEqual(0);
  });
}

// ヘッダー（見出し・口調・説明）が 1 行に収まる。
// 360・375・430px はどれも index.html のスマホ用の切り替え（max-width: 480px）の内側なので、ヘッダーは 1 行になる（v1.4.2 で 420px から広げた）
for (const width of [360, 375, 430]) {
  test('幅 ' + width + 'px: ヘッダーが 1 行（見出しが折り返さず、口調・説明ボタンが同じ行）', async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);
    const m = await page.evaluate(() => {
      const h1 = document.querySelector('.top h1');
      const rg = document.createRange(); rg.selectNodeContents(h1);
      const lines = new Set(Array.from(rg.getClientRects()).map(r => Math.round(r.top)));
      const top = document.querySelector('.top').getBoundingClientRect();
      const tone = document.getElementById('toneToggle').getBoundingClientRect();
      return { h1Lines: lines.size, headerH: top.height, toneTop: tone.top };
    });
    expect(m.h1Lines, '見出しが折り返さない').toBe(1);
    expect(m.headerH, 'ヘッダーの高さ（1 行なら 70px 前後）').toBeLessThan(80);
    expect(m.toneTop, '口調ボタンは見出しと同じ行').toBeLessThan(m.headerH);
  });
}

// ---------- 結果カードの頭が見える位置にスクロール ----------
async function headVisibleInLog(page, selector) {
  await expect.poll(async () => page.evaluate(sel => {
    const log = document.getElementById('log').getBoundingClientRect();
    const els = document.querySelectorAll(sel);
    const r = els[els.length - 1].getBoundingClientRect();
    return r.top >= log.top - 1 && r.bottom <= log.bottom + 1;
  }, selector), { message: selector + ' が会話ログの中で見える', timeout: 5000 }).toBe(true);
}

test('判定後: 結果カード（1 ハンド・1 日まとめ）の見出しが会話ログ内で見える。カード欄が開いていても', async ({ page }) => {
  await openApp(page);
  await test.step('判定後（1 ハンド）: 結果カードの見出しが会話ログ内で見える。カード欄が開いていても', async () => {
    await judge(page, 'AA vs KK');
    await headVisibleInLog(page, '.verdict .v-title');
    await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
    await headVisibleInLog(page, '.verdict .v-title');
    await page.locator('#pickerToggle').click();
    await judge(page, 'KK vs AA');
    await headVisibleInLog(page, '.verdict .v-title');
  });

  await test.step('判定後（1 日まとめ）: 結果カードの見出しと確率が会話ログ内で見える', async () => {
    await setTone(page, 'rough');
    await ask(page, 'KKで5回中3回負けた、AKも8回中5回');
    await headVisibleInLog(page, '.verdict .v-title');
    await headVisibleInLog(page, '.luck .luck-num');
    await expect(page.locator('.verdict').last().locator('.v-title')).toBeInViewport();
  });
});

// ---------- くわしく見る ----------
test('くわしく見る: スマホ幅（480px 以下）では閉じ、PC 幅では開いていて、押すと開閉する', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openApp(page);
  let d = page.locator('.verdict').first().locator('details.verdict-details');
  await expect(d).not.toHaveAttribute('open', '');
  await expect(d.locator('.trivia')).toBeHidden();
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
  await expect(d.locator('.trivia')).toBeVisible();
  await expect(d.locator('.tl')).toBeVisible();
  await d.locator('summary').click();
  await expect(d).not.toHaveAttribute('open', '');
  await expect(d.locator('.trivia')).toBeHidden();
  // 新しい判定も閉じた状態
  await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
  await expect(page.locator('.verdict').last().locator('details')).not.toHaveAttribute('open', '');
  // PC 幅で開き直すと開いた状態
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.waitForFunction(() => document.querySelectorAll('.sample-tag').length >= 2);
  d = page.locator('.verdict').first().locator('details.verdict-details');
  await expect(d).toHaveAttribute('open', '');
  await expect(d.locator('.trivia')).toBeVisible();
  await d.locator('summary').click();
  await expect(d).not.toHaveAttribute('open', '');
  await d.locator('summary').click();
  await expect(d).toHaveAttribute('open', '');
});

test('くわしく見る: 中身（逆転された・救う札・最後の役・ストリートごとの勝率）が出る', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openApp(page);
  await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
  const d = page.locator('.verdict').last().locator('details');
  await expect(d.locator('.facts')).toContainText('相手が勝つのは');
  await expect(d.locator('.facts')).toContainText('ターンの時点で相手を救う札は 残り44枚中2枚');
  await expect(d.locator('.facts')).toContainText('最後の役：お前はワンペア、相手はスリーカード');
  await expect(d.locator('.tl .tl-row')).toHaveCount(3);
});

// ---------- このページについて ----------
test('このページについて: ×・「閉じる」・Esc・外側のクリックで閉じる。中のクリックでは閉じない。「詳しく」からも開く', async ({ page }) => {
  await openApp(page);
  await test.step('このページについて: 開く → × で閉じる／「閉じる」で閉じる／Esc／外側のクリックで閉じる', async () => {
    const dlg = page.locator('#about');
    await expect(dlg).toBeHidden();
    await page.locator('#aboutOpen').click();
    await expect(dlg).toBeVisible();
    await expect(dlg.locator('#aboutTitle')).toHaveText('このページについて');
    await expect(dlg.locator('#aboutLogOn')).toBeVisible();
    await expect(dlg.locator('#aboutFeedback')).toBeHidden();
    await expect(page.locator('#aboutX')).toHaveAttribute('aria-label', '閉じる');
    await page.locator('#aboutX').click();
    await expect(dlg).toBeHidden();
    await page.locator('#aboutOpen').click();
    await expect(dlg).toBeVisible();
    await page.locator('#aboutClose').click();
    await expect(dlg).toBeHidden();
    await page.locator('#aboutOpen').click();
    await expect(dlg).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await page.locator('#aboutOpen').click();
    await expect(dlg).toBeVisible();
    await page.mouse.click(4, 4); // ダイアログの外（背景）
    await expect(dlg).toBeHidden();
  });

  await test.step('このページについて: 中をクリックしても閉じない。保存の案内の「詳しく」からも開く', async () => {
    await setTone(page, 'rough');
    await page.locator('#logNoticeMore').click();
    const dlg = page.locator('#about');
    await expect(dlg).toBeVisible();
    await dlg.locator('h2').click();
    await expect(dlg).toBeVisible();
    await expect(dlg).toContainText('入力は、読み取りの改善と統計のために');
    await expect(dlg).toContainText('名前や端末の情報を送ることはありません');
    await page.locator('#aboutX').click();
    await expect(dlg).toBeHidden();
  });
});

// 公開前の最小セット 3: ライト／ダーク両方で、結果カードの頭が見え、くわしく見るが開閉できる（スマホ幅）
for (const scheme of ['light', 'dark']) {
  test.describe('スマホ幅・' + scheme, () => {
    test.use({ colorScheme: scheme });
    test('結果カード（1 ハンド・1 日まとめ）の頭が見え、「くわしく見る」を開閉できる', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await openApp(page);
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(scheme === 'dark' ? DARK_BG : LIGHT_BG);
      await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh');
      await headVisibleInLog(page, '.verdict .v-title');
      const d = page.locator('.verdict').last().locator('details');
      await expect(d).not.toHaveAttribute('open', '');
      await d.locator('summary').click();
      await expect(d.locator('.facts')).toBeVisible();
      await d.locator('summary').click();
      await expect(d.locator('.facts')).toBeHidden();
      await ask(page, 'KKで5回中3回負けた');
      await headVisibleInLog(page, '.luck .luck-num');
    });
  });
}

// v1.4.5: プライバシーの表記（リスク管理の指摘 A）
test('このページについて: 利用目的・保存項目・保存期間 1 年・外部への送信。運営者とフォームは未設定なら出さない', async ({ page }) => {
  await openApp(page);
  await page.locator('#aboutOpen').click();
  const dlg = page.locator('#about');
  await expect(dlg).toContainText('利用目的: 入力は、読み取りの改善と統計のために使います。');
  await expect(dlg).toContainText('入力した文章（先頭 100 文字）');
  await expect(dlg).toContainText('保存期間: 1 年。過ぎたものは削除します。');
  await expect(dlg).toContainText('Google Fonts（Google）: 文字の表示のため。IP アドレスなどの通信情報が送られます。');
  await expect(dlg).toContainText('Google Apps Script（Google）: 記録のため。');
  await expect(dlg.locator('#aboutOperator')).toBeHidden();
  await expect(dlg.locator('#aboutFeedback')).toBeHidden();
  await expect(dlg.locator('#aboutDeleteHow')).toBeHidden();
});

test('このページについて: フォームの URL と運営者名を設定すると、連絡先・削除の依頼・運営者が出る', async ({ page }) => {
  // 設定値だけを差し替えたページを返す（本番の index.html は変えない）
  await page.route(url => new URL(url).pathname === '/', async route => {
    const res = await route.fetch();
    const html = (await res.text())
      .replace("FEEDBACK_URL: ''", "FEEDBACK_URL: 'https://forms.gle/example-test'")
      .replace("OPERATOR_NAME: ''", "OPERATOR_NAME: 'テスト運営者'");
    await route.fulfill({ response: res, body: html });
  });
  await openApp(page);
  await page.locator('#aboutOpen').click();
  const dlg = page.locator('#about');
  await expect(dlg.locator('#aboutOperator')).toBeVisible();
  await expect(dlg.locator('#operatorName')).toHaveText('テスト運営者');
  await expect(dlg.locator('#aboutFeedback')).toBeVisible();
  await expect(dlg.locator('#feedbackLink')).toHaveAttribute('href', 'https://forms.gle/example-test');
  await expect(dlg.locator('#feedbackLink')).toHaveAttribute('target', '_blank');
  await expect(dlg.locator('#aboutDeleteHow')).toBeVisible();
});
