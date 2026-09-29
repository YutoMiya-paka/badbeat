// カード選択欄: 数字→マーク、使用済み不可、枠で消す、クリア、ボードは左から、エラー、判定後の表記と結果。
const { test, expect } = require('@playwright/test');
const { openApp, waitIdle, payloads, webkitFilter } = require('./helpers');
webkitFilter(test, { skip: ['エラー（やさしめ）'] });
test.describe.configure({ timeout: 120000 });

const RANK_ID = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, T: 8, 10: 8, J: 9, Q: 10, K: 11, A: 12 };
const SUIT_ID = { s: 0, h: 1, d: 2, c: 3 };
const SYM = { s: '♠', h: '♥', d: '♦', c: '♣' };

async function openPicker(page) {
  await page.locator('#pickerToggle').click();
  await expect(page.locator('#picker')).toBeVisible();
}
// 現在の枠に「数字 → マーク」の順で 1 枚選ぶ
async function pickCard(page, rank, suit) {
  await page.locator('#rk-' + RANK_ID[rank]).click();
  await page.locator('#su-' + SUIT_ID[suit]).click();
}
async function pickCards(page, list) { for (const [r, s] of list) await pickCard(page, r, s); }
const slotText = async (page, k) => (await page.locator('#slot-' + k).innerText()).replace(/\s+/g, '');

// 1 テストごとにページを開き直すと、起動時の見本の計算が毎回入って遅いので、部品の操作は 1 ページでまとめて確かめる（test.step で区切る）。
async function resetPicker(page) {
  if (await page.locator('#picker').isHidden()) await page.locator('#pickerToggle').click();
  await expect(page.locator('#picker')).toBeVisible();
  await page.locator('#pkClear').click();
  await page.locator('#st-0').click();
}

test('カード欄の操作: 開閉・部品・数字→マーク・使用済み不可・枠で消す・クリア・場面・ボタンの大きさ', async ({ page }) => {
  await openApp(page);
  await test.step('カード欄の開閉: 「カード」で開き、もう一度で閉じる（aria-expanded が変わる）', async () => {
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-expanded', 'false');
    await resetPicker(page);
    await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('#pickerToggle').click();
    await expect(page.locator('#picker')).toBeHidden();
    await expect(page.locator('#pickerToggle')).toHaveAttribute('aria-expanded', 'false');
  });

  await test.step('部品が揃っている: 枠 9 個・ランク 13 個・スート 4 個・場面 3 つ（初期はプリフロ）', async () => {
    await resetPicker(page);
    await expect(page.locator('#pkSlots .slot')).toHaveCount(9);
    await expect(page.locator('#pkRanks .key')).toHaveCount(13);
    await expect(page.locator('#pkSuits .key')).toHaveCount(4);
    await expect(page.locator('#rk-0')).toHaveText('2');
    await expect(page.locator('#rk-8')).toHaveText('10');
    await expect(page.locator('#rk-12')).toHaveText('A');
    for (const [i, s] of ['♠', '♥', '♦', '♣'].entries()) await expect(page.locator('#su-' + i)).toHaveText(s);
    await expect(page.locator('#st-0')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#st-3')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#st-4')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#slot-h0')).toHaveClass(/active/);
  });

  await test.step('数字を選ぶまでスートは押せない。数字 → マークの順で枠に入り、次の空き枠へ進む', async () => {
    await resetPicker(page);
    for (let i = 0; i < 4; i++) await expect(page.locator('#su-' + i)).toBeDisabled();
    await page.locator('#rk-12').click();
    await expect(page.locator('#rk-12')).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 4; i++) await expect(page.locator('#su-' + i)).toBeEnabled();
    await page.locator('#su-0').click();
    expect(await slotText(page, 'h0')).toBe('A♠');
    await expect(page.locator('#slot-h0')).toHaveClass(/filled/);
    await expect(page.locator('#slot-h0')).toHaveClass(/s0/);
    await expect(page.locator('#slot-h1')).toHaveClass(/active/);
    // 選び終わるとまたスートは押せない
    await expect(page.locator('#rk-12')).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 4; i++) await expect(page.locator('#su-' + i)).toBeDisabled();
    await pickCard(page, '10', 'h');
    expect(await slotText(page, 'h1')).toBe('10♥');
    await expect(page.locator('#slot-v0')).toHaveClass(/active/);
  });

  await test.step('使用済みのカードのスートは押せない（別の枠・ボードで選んだカードも）。4 枚使い切った数字は押せない', async () => {
    await resetPicker(page);
    await pickCard(page, 'A', 's');
    await page.locator('#rk-12').click();
    await expect(page.locator('#su-0')).toBeDisabled();
    await expect(page.locator('#su-1')).toBeEnabled();
    await expect(page.locator('#su-2')).toBeEnabled();
    await expect(page.locator('#su-3')).toBeEnabled();
    await page.locator('#su-1').click(); // h1 に A♥
    await pickCard(page, 'A', 'd');      // v0 に A♦
    await expect(page.locator('#rk-12')).toBeEnabled();
    await pickCard(page, 'A', 'c');      // v1 に A♣（A が 4 枚出た）
    await expect(page.locator('#rk-12')).toBeDisabled();
    // 別の数字はまだ選べる
    await expect(page.locator('#rk-11')).toBeEnabled();
    // ボード枠で選んだカードも他では選べない
    await page.locator('#slot-b0').click();
    await pickCard(page, 'K', 'h');
    await page.locator('#rk-11').click();
    await expect(page.locator('#su-1')).toBeDisabled();
    await expect(page.locator('#su-0')).toBeEnabled();
  });

});

test('カード欄の操作（続き）: 枠で消す・クリア・場面・ボタンの大きさ', async ({ page }) => {
  await openApp(page);
  await test.step('枠を 2 回押すと消える（1 回目は選択だけ）。消したカードは選び直せる', async () => {
    await resetPicker(page);
    await pickCards(page, [['A', 's'], ['K', 'h']]);
    expect(await slotText(page, 'h0')).toBe('A♠');
    await page.locator('#slot-h0').click();          // 1 回目: 選択（カードは残る）
    expect(await slotText(page, 'h0')).toBe('A♠');
    await expect(page.locator('#slot-h0')).toHaveClass(/active/);
    await page.locator('#slot-h0').click();          // 2 回目: 消える
    expect(await slotText(page, 'h0')).toBe('');
    await expect(page.locator('#slot-h0')).not.toHaveClass(/filled/);
    expect(await slotText(page, 'h1')).toBe('K♥');   // 他の枠は残る
    await page.locator('#rk-12').click();
    await expect(page.locator('#su-0')).toBeEnabled(); // 消した A♠ は選び直せる
    await page.locator('#su-0').click();
    expect(await slotText(page, 'h0')).toBe('A♠');
  });

  await test.step('クリア: 全部の枠が空になり、エラー表示も消え、選択が先頭に戻る', async () => {
    await resetPicker(page);
    await pickCards(page, [['A', 's'], ['K', 'h'], ['Q', 'd']]);
    await page.locator('#pkJudge').click();
    await expect(page.locator('#pkError')).not.toHaveText('');
    await page.locator('#pkClear').click();
    for (const k of ['h0', 'h1', 'v0', 'v1', 'b0', 'b1', 'b2', 'b3', 'b4']) expect(await slotText(page, k)).toBe('');
    await expect(page.locator('#pkError')).toHaveText('');
    await expect(page.locator('#slot-h0')).toHaveClass(/active/);
    await page.locator('#rk-12').click();
    await expect(page.locator('#su-0')).toBeEnabled();
  });

  await test.step('場面の切り替え: aria-checked が 1 つだけ true になる', async () => {
    await resetPicker(page);
    await page.locator('#st-4').click();
    await expect(page.locator('#st-4')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#st-0')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#st-3')).toHaveAttribute('aria-checked', 'false');
    await page.locator('#st-3').click();
    await expect(page.locator('#st-3')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#st-4')).toHaveAttribute('aria-checked', 'false');
  });

  await test.step('ランクのボタンは 40px 以上の大きさ', async () => {
    await resetPicker(page);
    for (let r = 0; r < 13; r++) {
      const box = await page.locator('#rk-' + r).boundingBox();
      expect(box.height, 'rk-' + r + ' の高さ').toBeGreaterThanOrEqual(40);
      expect(box.width, 'rk-' + r + ' の幅').toBeGreaterThanOrEqual(40);
    }
  });

});

const ERR = {
  rough: {
    hero: '自分の手札を2枚選んでくれ', vill: '相手の手札を2枚選んでくれ', left: 'ボードは左から順に埋めてくれ',
    few: 'ボードは3枚（フロップ）から選んでくれ', flop: 'フロップでオールインなら、そのときのボードも選んでくれ', turn: 'ターンでオールインなら、そのときのボードも選んでくれ'
  },
  gentle: {
    hero: '自分の手札を2枚選んでください', vill: '相手の手札を2枚選んでください', left: 'ボードは左から順に選んでください',
    few: 'ボードは3枚（フロップ）から選んでください', flop: 'フロップでオールインした場合は、その時点のボードも選んでください', turn: 'ターンでオールインした場合は、その時点のボードも選んでください'
  }
};
for (const tone of ['rough', 'gentle']) {
  test('エラー（' + (tone === 'rough' ? '荒め' : 'やさしめ') + '）: 手札不足・ボードは左から・ボード 1〜2 枚・場面に対してボード不足。判定は増えず、直すとエラーが消える', async ({ page }) => {
    const posts = await openApp(page, { hash: '#' + tone });
    const E = ERR[tone];
    const err = page.locator('#pkError');
    await openPicker(page);
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.hero);
    await pickCards(page, [['A', 's'], ['A', 'h']]);
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.vill);
    await pickCards(page, [['K', 'd'], ['K', 'c']]);
    // ボードを 3 枚目の枠だけ埋める → 左から順ではない
    await page.locator('#slot-b2').click();
    await pickCard(page, 'Q', 'h');
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.left);
    // 左から 1 枚だけ・2 枚だけ
    await page.locator('#slot-b2').click(); await page.locator('#slot-b2').click(); // 消す
    await page.locator('#slot-b0').click();
    await pickCard(page, 'Q', 'h');
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.few);
    await pickCard(page, '7', 'c');
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.few);
    // 場面に対するボード不足: 3 枚（フロップ）でターンでオールイン
    await pickCard(page, '2', 'd');
    await page.locator('#st-4').click();
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.turn);
    // ボード無しでフロップでオールイン
    await page.locator('#slot-b0').click(); await page.locator('#slot-b0').click();
    await page.locator('#slot-b1').click(); await page.locator('#slot-b1').click();
    await page.locator('#slot-b2').click(); await page.locator('#slot-b2').click();
    await page.locator('#st-3').click();
    await page.locator('#pkJudge').click();
    await expect(err).toHaveText(E.flop);
    // 枠を触るとエラーが消える
    await page.locator('#slot-b0').click();
    await expect(err).toHaveText('');
    await expect(page.locator('.verdict')).toHaveCount(1);
    expect(payloads(posts)).toHaveLength(0);
  });
}

// 判定は、直前の判定カードの数を控えておいて、増えるまで待つ
async function judgeFromPicker(page) {
  const prior = await page.locator('.verdict').count();
  await page.locator('#pkJudge').click();
  await page.waitForFunction(n => document.querySelectorAll('.verdict').length > n, prior);
  await waitIdle(page);
}

test('判定: 吹き出しの表記が選んだカードと一致し、結果が文字入力と同じ。10・5 枚ボード・判定後の状態', async ({ page }) => {
  const posts = await openApp(page);
  await test.step('AA vs KK・フロップ Q♥ 7♣ 2♦: 表記・通り数・結果が文字入力の同じ場面と同じ。記録は source=picker', async () => {
    await resetPicker(page);
    await pickCards(page, [['A', 's'], ['A', 'h'], ['K', 'd'], ['K', 'c']]);
    await page.locator('#slot-b0').click();
    await pickCards(page, [['Q', 'h'], ['7', 'c'], ['2', 'd']]);
    await page.locator('#st-3').click();
    await judgeFromPicker(page);
    await expect(page.locator('.row.me .bubble').last()).toHaveText('A♠A♥ vs K♦K♣  ボード Q♥ 7♣ 2♦（フロップでオールイン）');
    const v = page.locator('.verdict').last();
    await expect(v.locator('.eq-label')).toContainText('フロップでオールインした時点');
    await expect(v.locator('.eq-count')).toHaveText('990通りを計算');
    const cards = (await v.locator('.hands').innerText()).replace(/\s+/g, ' ');
    for (const c of ['A', 'K', 'Q', '7', '2', '♠', '♥', '♦', '♣']) expect(cards).toContain(c);
    const pickerHn = await v.locator('.hn').innerText();
    const pickerTitle = await v.locator('.v-title').innerText();
    // 同じ場面を文字で入力した結果と比べる
    await page.locator('#pickerToggle').click();
    const prior = await page.locator('.verdict').count();
    await page.locator('#msg').fill('AsAh vs KdKc フロップでオールイン Qh 7c 2d');
    await page.locator('#send').click();
    await page.waitForFunction(n => document.querySelectorAll('.verdict').length > n, prior);
    await waitIdle(page);
    const typed = page.locator('.verdict').last();
    await expect(typed.locator('.hn')).toHaveText(pickerHn);
    await expect(typed.locator('.v-title')).toHaveText(pickerTitle);
    const sent = payloads(posts);
    expect(sent[0].source).toBe('picker');
    expect(sent[0].hero).toBe('AsAh'); expect(sent[0].vill).toBe('KdKc'); expect(sent[0].board).toBe('Qh7c2d');
    expect(sent[0].street).toBe(3);
    expect(sent[0].autoSuits).toBe(false);
    expect(sent[1].source).toBe('text');
  });
});

test('判定（続き）: 10 の表記・ボード 5 枚の勝ち・判定後の状態', async ({ page }) => {
  await openApp(page);
  await test.step('10 を含む選択（10♥ 10♠ vs A♦ K♣、プリフロ）は「10」と表記される', async () => {
    await resetPicker(page);
    await pickCards(page, [['10', 'h'], ['10', 's'], ['A', 'd'], ['K', 'c']]);
    await judgeFromPicker(page);
    await expect(page.locator('.row.me .bubble').last()).toHaveText('10♥10♠ vs A♦K♣（プリフロップでオールイン）');
    await expect(page.locator('.verdict').last().locator('.eq-count')).toHaveText('1,712,304通りを計算');
  });
  await test.step('ボード 5 枚でリバーまで選ぶと「勝ち」の判定（A♠A♥ vs 7♦2♣、ボード 8♥ 3♣ 4♦ 5♠ 9♠）', async () => {
    await resetPicker(page);
    await pickCards(page, [['A', 's'], ['A', 'h'], ['7', 'd'], ['2', 'c'], ['8', 'h'], ['3', 'c'], ['4', 'd'], ['5', 's'], ['9', 's']]);
    await page.locator('#st-3').click();
    await judgeFromPicker(page);
    await expect(page.locator('.row.me .bubble').last()).toHaveText('A♠A♥ vs 7♦2♣  ボード 8♥ 3♣ 4♦ 5♠ 9♠（フロップでオールイン）');
    await expect(page.locator('.verdict').last().locator('.v-title')).toHaveText('勝ってるじゃねえか');
  });
  await test.step('判定後もカード欄の中身は残り、エラー表示は消える', async () => {
    await resetPicker(page);
    await page.locator('#pkJudge').click();
    await expect(page.locator('#pkError')).not.toHaveText('');
    await pickCards(page, [['A', 's'], ['A', 'h'], ['K', 'd'], ['K', 'c']]);
    await judgeFromPicker(page);
    await expect(page.locator('#pkError')).toHaveText('');
    expect(await slotText(page, 'h0')).toBe('A♠');
  });
});
