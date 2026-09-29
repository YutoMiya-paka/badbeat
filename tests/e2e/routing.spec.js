// 入力の振り分け（あいさつ・お礼・雑談・カードの書き損じ・1 ハンド・1 日まとめ）と、読み取りエラーの文面、計算中の二重送信防止。
// 1 テストごとにページを開き直すと、起動時の見本の計算が毎回入って遅いので、関連する流れは 1 ページでまとめて確かめる（test.step で区切る）。
const { test, expect } = require('@playwright/test');
const { openApp, judge, ask, payloads } = require('./helpers');
test.describe.configure({ timeout: 120000 });

const THANKS = '礼はいい。次は勝って報告しに来い。';
const THANKS_G = 'どういたしまして。いつでもご相談ください。';

test('振り分け: あいさつ・お礼・雑談・カードの書き損じは返事だけ（判定も 1 日まとめも出ない）。荒め・やさしめ', async ({ page }) => {
  await openApp(page);
  await test.step('あいさつ（荒め）: 返事と入力例のボタン 7 つ', async () => {
    const b = await ask(page, 'こんにちは');
    await expect(b).toContainText('おう、座れ。負けたハンドを見せてみろ。');
    await expect(b.locator('.ex')).toHaveCount(7);
  });
  await test.step('お礼（荒め）: ありがとう・サンキュー・助かった', async () => {
    for (const t of ['ありがとう', 'サンキュー', '助かった']) await expect(await ask(page, t)).toHaveText(THANKS);
  });
  await test.step('回帰: 「今日はありがとう」は 1 日まとめに流れず、お礼の返事になる（聞き返しも結果も出ない）', async () => {
    await expect(await ask(page, '今日はありがとう')).toHaveText(THANKS);
    await expect(page.locator('.luck')).toHaveCount(0);
    await expect(page.locator('.row.bot .bubble', { hasText: '何回オールイン' })).toHaveCount(0);
  });
  await test.step('雑談（荒め）: 相談所の案内と入力例', async () => {
    const b = await ask(page, 'お腹すいた');
    await expect(b).toContainText('悪いが、ここはバッドビートの相談所だ。負けたハンドの話なら聞くぞ。');
    await expect(b.locator('.ex')).toHaveCount(7);
  });
  await test.step('「今日」を含む雑談は、手が読めないと案内される', async () => {
    await expect(await ask(page, '今日は天気がいいね')).toHaveText('どの手で負けたのか読めなかった。「KKで5回中3回負けた」みたいに、手と回数を書いてくれ。');
  });
  await test.step('カードの書き損じ（荒め）', async () => {
    const b = await ask(page, 'ポケットペアで負けた');
    await expect(b).toContainText('カードが読み取れなかった。');
    await expect(b.locator('.ex')).toHaveCount(7);
  });
  await page.locator('#toneToggle').click();
  await test.step('やさしめの返事（あいさつ・お礼・雑談・「今日」雑談・書き損じ）', async () => {
    await expect(await ask(page, 'おはよう')).toContainText('こんにちは。負けたハンドを一緒に確認していきましょう。');
    await expect(await ask(page, 'ありがとう')).toHaveText(THANKS_G);
    await expect(await ask(page, '今日はありがとう')).toHaveText(THANKS_G);
    await expect(await ask(page, 'お腹すいた')).toContainText('こちらはバッドビートの相談所です。負けたハンドについてお聞かせください。');
    await expect(await ask(page, '今日は天気がいいね')).toHaveText('どの手で負けたか読み取れませんでした。「KKで5回中3回負けた」のように、手と回数を入力してください。');
    await expect(await ask(page, 'ポケットペアで負けた')).toContainText('カードを読み取れませんでした。入力例をご確認ください。');
  });
  await expect(page.locator('.verdict')).toHaveCount(1); // 見本だけ。判定は増えていない
  await expect(page.locator('.luck')).toHaveCount(0);
  await page.locator('#toneToggle').click();
  await test.step('お礼のあとの入力は普通の相談として判定される', async () => {
    const v = await judge(page, 'AA vs KK');
    expect(v.title).toBe('バッドビート');
  });
  await test.step('「今日AA vs KKで負けた」は 1 ハンドとして判定される（1 日まとめにならない）', async () => {
    const v = await judge(page, '今日AA vs KKで負けた');
    expect(v.title).toBe('バッドビート');
    await expect(page.locator('.luck')).toHaveCount(0);
  });
  await test.step('入力例のボタン: 押すと入力例が送られて判定される', async () => {
    const ex = page.locator('.ex', { hasText: '72o vs AA' }).first();
    await ex.scrollIntoViewIfNeeded();
    const prior = await page.locator('.verdict').count();
    await ex.click();
    await expect(page.locator('.row.me .bubble').last()).toHaveText('72o vs AA');
    await page.waitForFunction(n => document.querySelectorAll('.verdict').length > n, prior);
    await expect(page.locator('.verdict').last().locator('.v-title')).toHaveText('バッドビートじゃねえ');
  });
});

const ERRORS = [
  ['ペアに s を付けた', 'KKs vs AA', '「KKs」が読めなかった。ペアに s（スーテッド）は付かないぞ。', '「KKs」を読み取れませんでした。ペアには s（スーテッド）を付けられません。'],
  ['同じカードが 2 回', 'Ah Ah vs Kd Kc', 'Ah が 2 回出てくる。同じカードは 1 枚しかないぞ。', '「Ah」が重複しています。同じカードは1枚だけ入力できます。'],
  ['相手の手札が無い', 'AA負けた', '相手の手札が見つからない。', '相手の手札が見つかりません。2人分の手札を入力してください'],
  ['自分の手札が 1 枚だけ', 'Ah', '自分の手札が 2 枚そろってない。', '自分の手札は2枚そろえて入力してください。'],
  ['ボードが 6 枚', 'AhAs vs KdKc Qh 7c 2d Ks 9s 3c', 'ボードが 6 枚ある。多くても 5 枚だ。', 'ボードは6枚あります。5枚まで入力できます。'],
  ['ボードが 2 枚', 'AA vs KK ボード Qh 7c', 'ボードは 3 枚（フロップ）から書いてくれ。', 'ボードは3枚（フロップ）から入力してください。'],
  ['場面に対してボードが足りない', 'AhKh vs QsQd フロップでオールイン', 'フロップでオールインなら、そのときのボード（3 枚）も書いてくれ。', 'フロップでオールインした場合は、その時点のボード（3枚）も入力してください。']
];
test('空の入力は送られない。読み取りエラーの文面（荒め・やさしめ）: 判定は出ず、エラーは記録に ok:false で送られる', async ({ page }) => {
  const posts = await openApp(page);
  // 空・空白だけの入力
  const before = await page.locator('.row').count();
  await page.locator('#msg').fill('   ');
  await page.locator('#send').click();
  await page.locator('#msg').fill('');
  await page.locator('#msg').press('Enter');
  await expect(page.locator('.row')).toHaveCount(before);
  expect(posts).toHaveLength(0);

  for (const [, input, rough] of ERRORS) await expect(await ask(page, input)).toContainText(rough);
  await page.locator('#toneToggle').click();
  for (const [, input, , gentle] of ERRORS) await expect(await ask(page, input)).toContainText(gentle);
  await expect(page.locator('.verdict')).toHaveCount(1);
  const sent = payloads(posts);
  expect(sent).toHaveLength(ERRORS.length * 2);
  for (const p of sent) { expect(p.ok).toBe(false); expect(p.error.length).toBeGreaterThan(0); }
});

test('計算中は送信・カードの判定ボタンが押せず、Enter（送信操作）でも二重送信されない', async ({ page }) => {
  await openApp(page);
  await page.locator('#msg').fill('AA vs KK');
  await page.locator('#send').click();
  // 計算（プリフロの全通り）が終わる前に確かめるため、1 回の処理の中で「状態の確認 → 別の入力の送信操作」まで行う
  const during = await page.evaluate(() => {
    const send = document.getElementById('send'), judgeBtn = document.getElementById('pkJudge'), msg = document.getElementById('msg');
    const state = { sendDisabled: send.disabled, judgeDisabled: judgeBtn.disabled, inputDisabled: msg.disabled, typing: document.querySelectorAll('.typing').length };
    msg.value = '72o vs AA';
    document.getElementById('composer').requestSubmit(); // Enter と同じ送信操作
    state.valueKept = msg.value;
    state.userRows = Array.from(document.querySelectorAll('.row.me .bubble')).filter(b => b.textContent === '72o vs AA').length;
    return state;
  });
  expect(during.sendDisabled, '計算中は送信ボタンが押せない').toBe(true);
  expect(during.judgeDisabled, '計算中はカード欄の判定ボタンも押せない').toBe(true);
  expect(during.inputDisabled, '計算中は入力欄も触れない（v1.4.4）').toBe(true);
  expect(during.typing).toBe(1);
  expect(during.valueKept, '送られず入力欄に残る').toBe('72o vs AA');
  expect(during.userRows, '2 つ目の入力は吹き出しにならない').toBe(0);
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 2);
  await expect(page.locator('#send')).toBeEnabled();
  await expect(page.locator('#pkJudge')).toBeEnabled();
  await expect(page.locator('.verdict')).toHaveCount(2);
  await expect(page.locator('.typing')).toHaveCount(0);
  await expect(page.locator('.row.me .bubble', { hasText: '72o vs AA' })).toHaveCount(0);
  // 終わったあとは、残っていた入力をそのまま送れる
  await page.locator('#send').click();
  await page.waitForFunction(() => document.querySelectorAll('.verdict').length >= 3);
  await expect(page.locator('.row.me .bubble').last()).toHaveText('72o vs AA');
});
