// 口調（切り替え・#gentle #rough・再読み込み・localStorage が使えない環境）と、休憩・案内の声かけ。
// 1 テストごとにページを開き直すと、起動時の見本の計算が毎回入って遅いので、関連する流れは 1 ページでまとめて確かめる（test.step で区切る）。
const { test, expect } = require('@playwright/test');
const { openApp, judge, ask, waitSampleDone, setTone, webkitFilter } = require('./helpers');
webkitFilter(test, { skip: ['休憩の声かけ', '同情が 2 回続くと', '案内が出る', '案内の条件'] });
test.describe.configure({ timeout: 120000 });

// 計算が軽い（ボード 4〜5 枚）入力。区分は engine で確かめた
const REAL = 'AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s';                  // 本物のバッドビート
const USUAL = 'AhAs vs 6c5c フロップでオールイン 4c 3d 9s';                    // よくある負け
const SEKKYO = 'AhKh vs QsQd フロップでオールイン Qc 8h 3h 2s 9d';             // 説教
const DEAD = 'AhAs vs KdKc ターンでオールイン Qh 7c 2d Ks 9s';                 // 重症の説教
const WON = 'AhAs vs 7d2c フロップでオールイン 8h 3c 4d 5s 9s';                 // 勝ち
const CHOP = 'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c';                // 引き分け

const REST = '続けて負けが入っていますね。少し席を立って、水を飲むなどして休憩しませんか。落ち着いてからの方が、判断もしやすくなります。';
const YAKUBI = '今日は厄日だな。';
const YAKUBI_G = '何度か続いた場合は、「KKで5回中3回負けた」のように書くと';
const HINT = '口調は右上のボタンで「やさしめ」にも変えられるぞ。';
const hasRest = v => v.notes.some(n => n.includes(REST));

async function toneState(page) {
  return {
    pressed: await page.locator('#toneToggle').getAttribute('aria-pressed'),
    label: await page.locator('#toneToggle').getAttribute('aria-label'),
    text: (await page.locator('#toneToggle').textContent()).replace(/\s+/g, ''),
    sub: (await page.locator('.top-text p').textContent()).trim(),
    notice: (await page.locator('#logNoticeText').textContent()).trim()
  };
}

test('既定は荒め。切り替えで、ボタン表示・aria・副題・保存の案内・アバター・切り替えの一言・返事の口調が変わる', async ({ page }) => {
  await openApp(page);
  let s = await toneState(page);
  expect(s.pressed).toBe('false');
  expect(s.label).toBe('口調を切り替える。現在は荒め');
  expect(s.text).toContain('口調：荒め');
  expect(s.text).toContain('口調荒め');
  expect(s.sub).toBe('負けたハンドを書けば、おやっさんが確率だけで判定する');
  expect(s.notice).toBe('入力はスプレッドシートに保存。個人情報は書かないで');
  await expect(page.locator('.row.bot .avatar').first()).toHaveText('親');

  await page.locator('#toneToggle').click();
  s = await toneState(page);
  expect(s.pressed).toBe('true');
  expect(s.label).toBe('口調を切り替える。現在はやさしめ');
  expect(s.text).toContain('口調：やさしめ');
  expect(s.text).toContain('口調やさしめ');
  expect(s.sub).toBe('負けたハンドを書くと、確率だけで判定します');
  expect(s.notice).toBe('入力はスプレッドシートに保存されます。個人情報は書かないでください');
  const last = page.locator('.row.bot').last();
  await expect(last).toContainText('やさしめの口調に切り替えました。負けたハンドを、落ち着いて一緒に見ていきましょう。');
  await expect(last.locator('.avatar')).toHaveText('相');
  await expect(await ask(page, 'ありがとう')).toHaveText('どういたしまして。いつでもご相談ください。');

  await page.locator('#toneToggle').click();
  s = await toneState(page);
  expect(s.pressed).toBe('false');
  expect(s.sub).toBe('負けたハンドを書けば、おやっさんが確率だけで判定する');
  await expect(page.locator('.row.bot').last()).toContainText('おう、いつもの調子に戻すぞ。');
  await expect(page.locator('.row.bot').last().locator('.avatar')).toHaveText('親');
});

test('再読み込みしても口調が残る（やさしめ → 荒めに戻して再読み込み）', async ({ page }) => {
  await openApp(page);
  await page.locator('#toneToggle').click();
  await page.reload();
  await waitSampleDone(page);
  expect((await toneState(page)).pressed).toBe('true');
  await expect(page.locator('.row.bot .avatar').first()).toHaveText('相');
  await expect(page.locator('.row.bot .bubble').first()).toContainText('こんにちは。バッドビートかどうか、一緒に確認していきましょう。');
  await expect(page.locator('.verdict').first().locator('.v-title')).toHaveText('バッドビート');
  await page.locator('#toneToggle').click();
  await page.reload();
  await waitSampleDone(page);
  expect((await toneState(page)).pressed).toBe('false');
  await expect(page.locator('.row.bot .bubble').first()).toContainText('よう。バッドビートを食らったか？');
});

test('URL の #gentle は保存済みの口調より優先される', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('badbeat.tone', 'rough'); } catch (e) {} });
  await openApp(page, { hash: '#gentle' });
  expect((await toneState(page)).pressed).toBe('true');
});
test('URL の #rough は保存済みのやさしめより優先される', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('badbeat.tone', 'gentle'); } catch (e) {} });
  await openApp(page, { hash: '#rough' });
  expect((await toneState(page)).pressed).toBe('false');
});
test('URL に指定が無ければ、保存済みのやさしめが使われる', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('badbeat.tone', 'gentle'); } catch (e) {} });
  await openApp(page);
  expect((await toneState(page)).pressed).toBe('true');
});

test('localStorage が例外を投げる環境（プライベートブラウズ等）でも、表示・判定・口調の切り替えができる', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const boom = () => { throw new DOMException('denied', 'SecurityError'); };
    Object.defineProperty(window, 'localStorage', { configurable: true, get: boom });
  });
  await openApp(page);
  expect((await toneState(page)).pressed).toBe('false');
  const v = await judge(page, 'AA vs KK');
  expect(v.title).toBe('バッドビート');
  await page.locator('#toneToggle').click();
  expect((await toneState(page)).pressed).toBe('true');
  const g = await judge(page, 'KK vs AA');
  expect(g.title).toBe('クーラー');
  // 説教（荒めの案内の保存も例外になる）でも止まらない
  await page.locator('#toneToggle').click();
  const s = await judge(page, SEKKYO);
  expect(s.title).toBe('バッドビートじゃねえ');
  expect(errors).toEqual([]);
});

test('休憩の声かけ: やさしめだけ、負けの 3・6 回目（見本は数えない）。勝ち・引き分けで 0 に戻る。荒めでは出ない', async ({ page }) => {
  await openApp(page, { hash: '#gentle' });
  await test.step('負け 6 回: 3 回目と 6 回目だけ', async () => {
    const notes = [];
    for (let i = 1; i <= 6; i++) notes.push(hasRest(await judge(page, i % 2 ? USUAL : REAL)));
    expect(notes).toEqual([false, false, true, false, false, true]);
    await expect(page.locator('.verdict').nth(3).locator('p.note').first()).toHaveText(REST); // 休憩の一文は正確にこの文
  });
  await test.step('勝ちで 0 に戻る（勝ち・負け・負け・負け → 3 回目の負けで出る）', async () => {
    expect(hasRest(await judge(page, WON))).toBe(false);
    expect(hasRest(await judge(page, USUAL))).toBe(false);
    expect(hasRest(await judge(page, REAL))).toBe(false);
    expect(hasRest(await judge(page, USUAL))).toBe(true);
  });
  await test.step('引き分けでも 0 に戻る', async () => {
    expect(hasRest(await judge(page, CHOP))).toBe(false);
    expect(hasRest(await judge(page, USUAL))).toBe(false);
    expect(hasRest(await judge(page, REAL))).toBe(false);
    expect(hasRest(await judge(page, USUAL))).toBe(true);
  });
  await test.step('荒めでは 3 の倍数回でも出ない', async () => {
    await setTone(page, 'rough');
    for (let i = 0; i < 6; i++) expect(hasRest(await judge(page, i % 2 ? USUAL : REAL))).toBe(false);
    const all = await page.locator('.verdict').allInnerTexts();
    expect(all.slice(-6).join('')).not.toContain('休憩');
  });
});

test('荒め: 同情が 2 回続くと「今日は厄日だな」（1 回目・間に別の判定・勝ちのあとは付かない）。やさしめは穏やかな案内。見本は数えない', async ({ page }) => {
  await openApp(page, { hash: '#rough' });
  let v = await judge(page, REAL);
  expect(v.line, '見本のあとの最初の同情には付かない').not.toContain(YAKUBI);
  v = await judge(page, REAL);
  expect(v.line).toContain(YAKUBI);
  expect(v.line.endsWith('今日1日まとめて見てやるぞ。')).toBe(true);
  v = await judge(page, USUAL);
  expect(v.line).not.toContain(YAKUBI);
  v = await judge(page, REAL);
  expect(v.line).not.toContain(YAKUBI);
  v = await judge(page, REAL);
  expect(v.line).toContain(YAKUBI);
  await judge(page, WON);
  v = await judge(page, REAL);
  expect(v.line).not.toContain(YAKUBI);
  // やさしめ
  await setTone(page, 'gentle');
  await judge(page, USUAL);
  v = await judge(page, REAL);
  expect(v.line).not.toContain(YAKUBI_G);
  v = await judge(page, REAL);
  expect(v.line).toContain(YAKUBI_G);
  expect(v.line).not.toContain('厄日');
});

test('荒めで説教を初めて受けたときだけ、やさしめの案内が出る（2 回目は出ない・再読み込み後も出ない）', async ({ page }) => {
  await openApp(page, { hash: '#rough' });
  let v = await judge(page, USUAL);
  expect(v.notes.join('')).not.toContain(HINT);
  v = await judge(page, SEKKYO);
  expect(v.notes).toContain(HINT);
  v = await judge(page, DEAD);
  expect(v.notes.join('')).not.toContain(HINT);
  expect(await page.evaluate(() => localStorage.getItem('badbeat.toneHint'))).toBe('1');
  await page.reload();
  await waitSampleDone(page);
  v = await judge(page, SEKKYO);
  expect(v.notes.join('')).not.toContain(HINT);
});

test('案内の条件: やさしめの説教では出ず保存もされない。荒めに切り替えたあと、勝ち・クーラーでは出ず、重症の説教（dead）の初回で出る', async ({ page }) => {
  await openApp(page, { hash: '#gentle' });
  let v = await judge(page, SEKKYO);
  expect(v.notes.join('')).not.toContain(HINT);
  expect(await page.evaluate(() => localStorage.getItem('badbeat.toneHint'))).toBeNull();
  await setTone(page, 'rough');
  v = await judge(page, WON);
  expect(v.notes.join('')).not.toContain(HINT);
  v = await judge(page, 'KK vs AA');
  expect(v.notes.join('')).not.toContain(HINT);
  v = await judge(page, DEAD);
  expect(v.notes).toContain(HINT);
});
