// セキュリティ・プライバシー: 入力が HTML として動かない（XSS）、通信先の限定。
const { test, expect } = require('@playwright/test');
const { openApp, ask, judge, setTone } = require('./helpers');
test.describe.configure({ timeout: 120000 });

const PAYLOADS = [
  '<img src=x onerror=window.__pwned=1>',
  '<svg onload=window.__pwned=1>',
  '"><script>window.__pwned=1</script>',
  "'; window.__pwned=1; //",
  '<iframe srcdoc="<script>parent.__pwned=1</script>"></iframe>',
  '<a href="javascript:window.__pwned=1" id="evil">x</a>'
];

// 判定・1 日まとめとの組み合わせは、種類の違う 3 つ（img・script・iframe）で確かめる（全部の組み合わせは遅くなりすぎる）
const SOME = [PAYLOADS[0], PAYLOADS[2], PAYLOADS[4]];

async function expectNoInjection(page) {
  expect(await page.evaluate(() => window.__pwned), 'window.__pwned が立っていない').toBeUndefined();
  await expect(page.locator('#log img, #log script, #log iframe, #log svg, #log [onerror], #log [onload], #log a#evil, #log a[href^="javascript"]')).toHaveCount(0);
}

test('入力に HTML・スクリプトを入れても動かない（吹き出し・エラー文・判定・1 日まとめのラベルと聞き返し）', async ({ page }) => {
  await openApp(page);
  await test.step('入力に HTML・スクリプトを入れても動かない（吹き出し・案内・エラー文）', async () => {
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    for (const p of PAYLOADS) {
      await ask(page, p);
      await expectNoInjection(page);
      // 自分の吹き出しには文字のまま表示される
      await expect(page.locator('.row.me .bubble').last()).toHaveText(p);
      if (p.includes('<')) expect(await page.locator('.row.me .bubble').last().innerHTML()).toContain('&lt;');
    }
    expect(dialogs).toEqual([]);
  });

  await test.step('カードと HTML を混ぜた入力（判定・読み取りエラー）でも動かない', async () => {
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    await setTone(page, 'rough');
    for (const p of SOME) {
      await judge(page, 'AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s ' + p);
      await expectNoInjection(page);
      await ask(page, p + ' KKs vs AA');
      await expectNoInjection(page);
      await ask(page, 'Ah Ah vs Kd Kc ' + p);
      await expectNoInjection(page);
    }
    expect(dialogs).toEqual([]);
  });

  await test.step('1 日まとめ（手のラベル・聞き返し・答え）に HTML を混ぜても動かない', async () => {
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
    await setTone(page, 'rough');
    for (const p of SOME) {
      await ask(page, p + ' KKで3回負けた');
      await expectNoInjection(page);
      await ask(page, p + ' 4回');
      await expectNoInjection(page);
    }
    await ask(page, 'KKで3回負けた、<img src=x onerror=window.__pwned=1> AKで何回も負けた');
    await ask(page, '<img src=x onerror=window.__pwned=1>');
    await expectNoInjection(page);
    expect(dialogs).toEqual([]);
  });
});

test('通信先は自分のサーバー・Google Fonts（2 つ）・記録の受け口だけ（1 回の利用を通して）', async ({ page }) => {
  const hosts = new Set();
  page.on('request', r => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:' || u.protocol === 'about:') return;
    hosts.add(u.host);
  });
  // 外部への実通信は行わず、フォントの CSS は空で返す（通信先の確認だけが目的）
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await openApp(page);
  await judge(page, 'AA vs KK');
  await ask(page, 'KKで5回中3回負けた');
  await ask(page, 'ポケットペアで負けた');
  await page.locator('#pickerToggle').click();
  await page.locator('#aboutOpen').click();
  await page.locator('#aboutX').click();
  await page.locator('#toneToggle').click();
  await judge(page, 'KK vs AA');
  await expect.poll(async () => hosts.has('script.google.com')).toBe(true); // 記録は送っている
  const allowed = new Set(['localhost:5190', 'fonts.googleapis.com', 'fonts.gstatic.com', 'script.google.com']);
  const extra = [...hosts].filter(h => !allowed.has(h));
  expect(extra, '許可した通信先以外').toEqual([]);
  expect(hosts.has('fonts.googleapis.com')).toBe(true);
});

test('読み込むスクリプトは自分のサーバーのものだけ（外部スクリプト・外部 iframe が無い）', async ({ page }) => {
  await openApp(page);
  const srcs = await page.evaluate(() => Array.from(document.querySelectorAll('script[src], iframe, embed, object')).map(e => e.getAttribute('src') || e.tagName));
  expect(srcs).toEqual(['engine.js']);
  const links = await page.evaluate(() => Array.from(document.querySelectorAll('link[href]')).map(e => e.href).filter(h => !h.startsWith('data:')));
  for (const h of links) expect(h).toMatch(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//);
});

test('外部リンク（ご意見）を出すときは rel=noopener（今は未設定のため非表示であることを確認）', async ({ page }) => {
  await openApp(page);
  await expect(page.locator('#aboutFeedback')).toBeHidden();
  expect(await page.locator('#feedbackLink').getAttribute('rel')).toBe('noopener');
  expect(await page.locator('#feedbackLink').getAttribute('target')).toBe('_blank');
});
