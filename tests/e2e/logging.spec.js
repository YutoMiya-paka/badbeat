// 記録（Apps Script への送信）: 件数・見本なし・example・失敗も送る・50 件まで・項目・受け口の入力チェックを通ること・送信失敗でも画面が動くこと。
// 送信先は必ず偽物（helpers.installSafeRoutes）。本番には送らない。
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { openApp, judge, ask, payloads, loadAppsScriptFull, webkitFilter } = require('./helpers');
webkitFilter(test, { skip: ['1 タブ 50 件', '契約: いろいろな入力'] });
test.describe.configure({ timeout: 120000 });

const APP_VERSION = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8').match(/APP_VERSION: '([^']+)'/)[1];
const KEYS = ['v', 'source', 'ok', 'error', 'text', 'hero', 'vill', 'board', 'street', 'autoSuits', 'streetGuessed', 'verdict', 'equity', 'result'];
const FAST = 'AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s'; // 計算が軽い（44 通り）

const count = posts => posts.length;
async function waitPosts(posts, n) { await expect.poll(() => posts.length, { message: '記録の送信数', timeout: 10000 }).toBe(n); }

test('起動しただけ（見本の判定）では 1 件も送らない', async ({ page }) => {
  const posts = await openApp(page);
  await page.waitForTimeout(500);
  expect(count(posts)).toBe(0);
});

test('判定 1 回で 1 件: 送信先・方法・項目・値（フロップの例）', async ({ page }) => {
  const posts = await openApp(page);
  const input = 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh';
  await judge(page, input);
  await waitPosts(posts, 1);
  const req = page.context(); // eslint 対策の参照
  expect(req).toBeTruthy();
  expect(posts[0].url).toMatch(/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/);
  const p = payloads(posts)[0];
  expect(Object.keys(p).sort()).toEqual(KEYS.slice().sort());
  expect(p).toMatchObject({
    v: APP_VERSION, source: 'text', ok: true, error: '', text: input, hero: 'AhAs', vill: 'KdKc', board: 'Qh7c2d3sKh',
    street: 3, autoSuits: false, streetGuessed: false, verdict: 'real', result: 'lose'
  });
  expect(p.equity).toBeGreaterThan(0.9161); expect(p.equity).toBeLessThan(0.9163);
  expect(Math.round(p.equity * 10000) / 10000).toBe(p.equity); // 小数 4 桁まで
});

test('プリフロ（スート自動割り当て）の記録: autoSuits・streetGuessed・結果なし', async ({ page }) => {
  const posts = await openApp(page);
  await judge(page, 'AA vs KK');
  await waitPosts(posts, 1);
  expect(payloads(posts)[0]).toMatchObject({ source: 'text', ok: true, text: 'AA vs KK', hero: 'AsAh', vill: 'KdKc', board: '', street: 0, autoSuits: true, streetGuessed: true, verdict: 'bad', result: '' });
});

test('勝ち・引き分けの記録は result が win / tie', async ({ page }) => {
  const posts = await openApp(page);
  await judge(page, 'AhAs vs 7d2c フロップでオールイン 8h 3c 4d 5s 9s');
  await judge(page, 'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c');
  await waitPosts(posts, 2);
  const [w, t] = payloads(posts);
  expect(w).toMatchObject({ verdict: 'won', result: 'win' });
  expect(t).toMatchObject({ verdict: 'chop', result: 'tie', equity: 0.5 });
});

test('やさしめの版数は -g が付く', async ({ page }) => {
  const posts = await openApp(page, { hash: '#gentle' });
  await judge(page, FAST);
  await waitPosts(posts, 1);
  expect(payloads(posts)[0].v).toBe(APP_VERSION + '-g');
});

test('入力例のボタンから送ったものは source が example', async ({ page }) => {
  const posts = await openApp(page);
  const ex = page.locator('.ex', { hasText: '72o vs AA' }).first();
  await ex.scrollIntoViewIfNeeded();
  await ex.click();
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 2);
  await waitPosts(posts, 1);
  expect(payloads(posts)[0]).toMatchObject({ source: 'example', ok: true, text: '72o vs AA', verdict: 'sekkyo' });
});

test('カード欄から送ったものは source が picker（表記の text も入る）', async ({ page }) => {
  const posts = await openApp(page);
  await page.locator('#pickerToggle').click();
  for (const [r, s] of [[12, 0], [12, 1], [11, 2], [11, 3]]) { await page.locator('#rk-' + r).click(); await page.locator('#su-' + s).click(); }
  await page.locator('#pkJudge').click();
  await waitPosts(posts, 1);
  expect(payloads(posts)[0]).toMatchObject({ source: 'picker', ok: true, text: 'A♠A♥ vs K♦K♣（プリフロップでオールイン）', hero: 'AsAh', vill: 'KdKc', autoSuits: false, streetGuessed: false, street: 0 });
});

test('読み取りに失敗した入力も ok:false で送る（エラー内容つき）', async ({ page }) => {
  const posts = await openApp(page);
  await ask(page, 'ポケットペアで負けた');
  await ask(page, 'KKs vs AA');
  await ask(page, 'お腹すいた');
  await ask(page, '今日は天気がいいね');
  await waitPosts(posts, 4);
  const p = payloads(posts);
  expect(p[0]).toMatchObject({ ok: false, error: 'none', text: 'ポケットペアで負けた', hero: '', verdict: '', equity: null, street: null });
  expect(p[1]).toMatchObject({ ok: false, text: 'KKs vs AA' });
  expect(p[1].error).toContain('KKs');
  expect(p[2]).toMatchObject({ ok: false, error: 'none' });
  expect(p[3]).toMatchObject({ ok: false, error: 'daily_none' });
});

test('1 日まとめの記録: verdict が daily、ok:true', async ({ page }) => {
  const posts = await openApp(page);
  await ask(page, 'KKで5回中3回負けた');
  await waitPosts(posts, 1);
  expect(payloads(posts)[0]).toMatchObject({ source: 'text', ok: true, error: '', text: 'KKで5回中3回負けた', verdict: 'daily', equity: null, result: '', hero: '' });
});

test('聞き返しの途中（回答前）は送らない。結果が出たときに 1 件', async ({ page }) => {
  const posts = await openApp(page);
  await ask(page, 'KKで3回負けた');
  await page.waitForTimeout(300);
  expect(count(posts)).toBe(0);
  await ask(page, '4回');
  await waitPosts(posts, 1);
  expect(payloads(posts)[0]).toMatchObject({ verdict: 'daily', text: 'KKで3回負けた', ok: true });
});

test('送る入力文は 100 文字までに切られる', async ({ page }) => {
  const posts = await openApp(page);
  await ask(page, 'あ'.repeat(150));
  await waitPosts(posts, 1);
  expect(payloads(posts)[0].text).toBe('あ'.repeat(100));
});

test('1 タブ 50 件まで: 51 件目は送らないが、画面には判定が出る', async ({ page }) => {
  test.setTimeout(120000);
  const posts = await openApp(page);
  for (let i = 0; i < 51; i++) await judge(page, FAST);
  await waitPosts(posts, 50);
  await page.waitForTimeout(500);
  expect(count(posts)).toBe(50);
  await expect(page.locator('.verdict')).toHaveCount(52); // 見本 + 51
  await ask(page, 'お腹すいた'); // 読み取り失敗の記録も、上限後は送らない
  await page.waitForTimeout(300);
  expect(count(posts)).toBe(50);
});

test('名前・端末の情報を送らない: 項目は決まった 14 個だけで、UA・言語・URL などが本文に無い', async ({ page }) => {
  const posts = await openApp(page);
  await judge(page, FAST);
  await waitPosts(posts, 1);
  const ua = await page.evaluate(() => navigator.userAgent);
  const body = posts[0].body;
  expect(Object.keys(JSON.parse(body)).sort()).toEqual(KEYS.slice().sort());
  expect(body).not.toContain(ua);
  expect(body).not.toContain(await page.evaluate(() => location.href));
  expect(body).not.toMatch(/userAgent|language|screen|platform|cookie|referrer/i);
});

test('送信は POST・text/plain・no-cors で、Cookie を付けない', async ({ page }) => {
  const seen = [];
  await page.route('https://script.google.com/**', async route => {
    const r = route.request();
    seen.push({ method: r.method(), headers: await r.allHeaders() });
    await route.fulfill({ status: 200, body: 'ok' });
  });
  await page.goto('/');
  await page.waitForFunction(() => document.querySelectorAll('.sample-tag').length >= 2);
  await judge(page, FAST);
  await expect.poll(() => seen.length).toBe(1);
  expect(seen[0].method).toBe('POST');
  expect(seen[0].headers['content-type']).toMatch(/^text\/plain/);
  expect(seen[0].headers['cookie']).toBeUndefined();
});

// ---------- 送信失敗でも画面が止まらない ----------
test('送信に失敗（通信エラー）しても、判定・1 日まとめ・カード欄・口調の切り替えが動く', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const posts = await openApp(page, { abort: true });
  const v = await judge(page, FAST);
  expect(v.title).toBe('本物のバッドビート');
  await ask(page, 'KKで5回中3回負けた');
  await expect(page.locator('.luck')).toHaveCount(1);
  await ask(page, 'ポケットペアで負けた');
  await page.locator('#toneToggle').click();
  const v2 = await judge(page, FAST);
  expect(v2.title).toBe('とても不運なバッドビート');
  await page.locator('#pickerToggle').click();
  for (const [r, s] of [[12, 0], [12, 1], [11, 2], [11, 3]]) { await page.locator('#rk-' + r).click(); await page.locator('#su-' + s).click(); }
  await page.locator('#pkJudge').click();
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 5);
  await expect(page.locator('#send')).toBeEnabled();
  expect(posts.length).toBeGreaterThan(0); // 送ろうとはした
  expect(errors).toEqual([]);
});

test('受け口が 500 を返しても、画面が止まらない', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://script.google.com/**', route => route.fulfill({ status: 500, body: 'error' }));
  await page.goto('/');
  await page.waitForFunction(() => document.querySelectorAll('.sample-tag').length >= 2);
  const v = await judge(page, FAST);
  expect(v.title).toBe('本物のバッドビート');
  await expect(page.locator('#send')).toBeEnabled();
  expect(errors).toEqual([]);
});

// ---------- 契約テスト: ページが送る記録は Apps Script の入力チェックを通る ----------
test('契約: いろいろな入力で送られる本文が、Apps Script の doPost（偽のサービス）で ok になり、行が 1 件増える', async ({ page }) => {
  test.setTimeout(120000);
  const posts = await openApp(page);
  const inputs = [
    'AA vs KK', 'AKs vs QQ', '72o vs AA', 'AhKh vs QsQd フロップでオールイン Qc 8h 3h 2s 9d', '10h10s vs AdKc プリフロでオールイン Qh 7c 2d Ks 9s',
    'AhAs vs 7d2c フロップでオールイン 8h 3c 4d 5s 9s', 'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c', 'AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s',
    '♠A♥A vs ♦K♣K', '=1+1', '+SUM(A1)  AA vs KK', ' =cmd|"/c calc"!A1', '@x', '-1', 'ポケットペアで負けた', 'KKs vs AA', 'AhAs vs KdKc Qh 7c 2d Ks 9s 3c',
    'KKで5回中3回負けた、AKも8回中5回', '今日は天気がいいね', 'ありがとう', 'こんにちは', 'あ'.repeat(300), 'A'.repeat(100) + 'K', 'AA vs KK　改行\nあり'
  ];
  for (const t of inputs) await ask(page, t);
  // 聞き返し付きの 1 日まとめ・やさしめ・カード欄・入力例も
  await ask(page, 'KKで3回負けた'); await ask(page, '4回');
  await page.locator('#toneToggle').click();
  await judge(page, 'AA vs KK');
  await page.locator('.ex', { hasText: '72o vs AA' }).first().click();
  await page.waitForFunction(() => !document.querySelector('.typing') && !document.getElementById('send').disabled);
  await page.locator('#pickerToggle').click();
  for (const [r, s] of [[8, 1], [8, 0], [12, 2], [11, 3], [4, 0], [3, 1], [2, 2]]) { await page.locator('#rk-' + r).click(); await page.locator('#su-' + s).click(); }
  await page.locator('#st-3').click();
  await page.locator('#pkJudge').click();
  await page.waitForFunction(() => !document.querySelector('.typing') && !document.getElementById('send').disabled);
  await expect.poll(() => payloads(posts).some(p => p.source === 'picker'), { timeout: 30000, message: 'カード欄の記録が届く' }).toBe(true);
  await expect.poll(() => posts.length, { timeout: 15000 }).toBeGreaterThanOrEqual(inputs.length);
  await page.waitForTimeout(500);

  const bodies = payloads(posts);
  expect(bodies.length).toBeGreaterThan(25);
  const svc = loadAppsScriptFull();
  bodies.forEach((p, i) => {
    expect(Object.keys(p).sort(), '項目 #' + i).toEqual(KEYS.slice().sort());
    expect(posts[i].body.length, '本文の長さ #' + i).toBeLessThanOrEqual(4096);
    const before = svc.rows.length;
    const res = svc.post(posts[i].body);
    expect(res, 'doPost の結果 #' + i + ' ' + posts[i].body).toBe('ok');
    // 最初の 1 件はシート初期化の見出し行が入る
    const added = svc.rows.length - before;
    expect(added === 1 || added === 2, '追加された行 #' + i).toBe(true);
    const row = svc.rows[svc.rows.length - 1];
    // 数式として読まれる書き出しは ' が付いて保存される
    const text = p.text;
    const head = text.replace(/^[\s　]+/, '');
    expect(row[5]).toBe(/^[=+\-@＝＋－＠]/.test(head) ? "'" + text : text);
  });
  // 送るのは ok・source などの決まった値だけ
  for (const p of bodies) {
    expect(['text', 'picker', 'example']).toContain(p.source);
    expect(['win', 'lose', 'tie', '']).toContain(p.result);
    expect([null, 0, 3, 4]).toContain(p.street);
  }
  expect(bodies.some(p => p.source === 'picker')).toBe(true);
  expect(bodies.some(p => p.source === 'example')).toBe(true);
  expect(bodies.some(p => p.verdict === 'daily')).toBe(true);
  expect(bodies.some(p => p.ok === false)).toBe(true);
  expect(bodies.some(p => p.v.endsWith('-g'))).toBe(true);
});

test('契約（負の確認）: 受け口は不正な本文を ng にする（契約テストが素通りでないことの確認）', async () => {
  const svc = loadAppsScriptFull();
  expect(svc.post({ v: '1', source: 'admin', ok: true, error: '', text: '', hero: '', vill: '', board: '', street: null, autoSuits: false, streetGuessed: false, verdict: '', equity: null, result: '' })).toBe('ng');
  expect(svc.post({ v: '1', source: 'text', ok: true, error: '', text: '', hero: 'XX', vill: '', board: '', street: null, autoSuits: false, streetGuessed: false, verdict: '', equity: null, result: '' })).toBe('ng');
  expect(svc.post('{')).toBe('ng');
});
