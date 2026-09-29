// 判定 9 区分の見出し・チップ（荒め／やさしめ）と、境界の前後（90/75/55/45/8%）の代表入力。
// 各入力の勝率は engine を node で呼んで確かめた値（コメント）。
const { test, expect } = require('@playwright/test');
const { openApp, judge, setTone, loadLines, matchesAny, webkitFilter } = require('./helpers');
webkitFilter(test, { keep: ['区分: 勝ち・引き分け', '判定カードに手札', '勝率の数字'] });
test.describe.configure({ timeout: 120000 });

const LINES = loadLines();
const R = {
  real:   ['本物のバッドビート', '同情'], bad: ['バッドビート', '同情'], usual: ['よくある負け', '普通'],
  flip:   ['コインフリップ', '五分'], cooler: ['クーラー', '不運'], sekkyo: ['バッドビートじゃねえ', '説教'],
  dead:   ['バッドビートじゃねえ', '説教'], won: ['勝ってるじゃねえか', '確認'], chop: ['チョップ（引き分け）', '確認']
};
const G = {
  real:   ['とても不運なバッドビート', '共感'], bad: ['バッドビート', '共感'], usual: ['よくある負け', '通常'],
  flip:   ['五分に近い勝負', '五分'], cooler: ['クーラー', '不運'], sekkyo: ['バッドビートではありません', 'ふりかえり'],
  dead:   ['バッドビートではありません', 'ふりかえり'], won: ['このボードでは勝ち', '確認'], chop: ['引き分け', '確認']
};

// [説明, 入力, 区分, 勝率の目安, セリフが雛形どおりか（特別セリフが出る入力は false）]
const CASES = [
  ['E≥90% 本物のバッドビート（AA vs AKo 92.6%）', 'AA vs AKo', 'real', true],
  ['境界 90% の下は バッドビート（AA vs AKs 87.9%）', 'AA vs AKs', 'bad', true],
  ['プリフロの最大級 AA vs 72o 87.4% は バッドビート', 'AA vs 72o', 'bad', true],
  ['境界 75% の上は バッドビート（AKs vs AQo 75.6%）', 'AKs vs AQo', 'bad', true],
  ['境界 75% の下は よくある負け（AKo vs AJo 73.7%）', 'AKo vs AJo', 'usual', true],
  ['よくある負け（KK vs AKo 70.0%）', 'KK vs AKo', 'usual', true],
  ['境界 55% の上は よくある負け（66 vs AKo 55.4%）', '66 vs AKo', 'usual', true],
  ['境界 55% の下は コインフリップ（44 vs AKo 54.4%）', '44 vs AKo', 'flip', true],
  ['コインフリップ（AKo vs 33 46.2%）', 'AKo vs 33', 'flip', true],
  ['境界 45% の下で強い手（AK）は クーラー（AKo vs 55 44.99%）', 'AKo vs 55', 'cooler', true],
  ['強いペア TT はクーラー（TT vs AA 19.9%）', 'TT vs AA', 'cooler', true],
  ['クーラー（AKo vs QQ 42.8%）', 'AKo vs QQ', 'cooler', true],
  ['クーラー（KK vs AA 18.7%）※特別セリフ', 'KK vs AA', 'cooler', false],
  ['強くない手 99 は説教（99 vs AA 19.8%）', '99 vs AA', 'sekkyo', true],
  ['説教（72o vs AA 12.6%）', '72o vs AA', 'sekkyo', true],
  ['境界 8% の上で強くない手は説教（AJo vs AA 8.3%）', 'AJo vs AA', 'sekkyo', true],
  ['境界 8% の下は重症の説教（AQo vs AA 7.9%）', 'AQo vs AA', 'dead', true],
  ['強い手でも 8% 未満は重症の説教（AKo vs AA 7.4%）', 'AK vs AA', 'dead', true],
  ['フロップ: 自分がツーペア以上ならクーラー（KhQh vs 5d4d フロップ Kd Qd 2d 17.5%）', 'KhQh vs 5d4d フロップでオールイン Kd Qd 2d', 'cooler', true],
  ['フロップ: 強くない手は説教（AhKh vs QsQd Qc 8h 3h 2s 9d 25.6%）', 'AhKh vs QsQd フロップでオールイン Qc 8h 3h 2s 9d', 'sekkyo', true],
  ['ターン: 4.5% は重症の説教（AA vs KK ターンでオールイン Qh 7c 2d Ks 9s）', 'AhAs vs KdKc ターンでオールイン Qh 7c 2d Ks 9s', 'dead', true],
  ['フロップ: 91.6% は本物のバッドビート（リバーで K）※リバーの 2 アウター', 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh', 'real', false],
  ['ボード 5 枚で自分が勝っている（96.0%）', 'AhAs vs 7d2c フロップでオールイン 8h 3c 4d 5s 9s', 'won', true],
  ['ボード 5 枚で引き分け', 'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c', 'chop', true]
];

// 1 ケースごとにページを開き直すと、起動時の見本の計算（プリフロ全通り）が毎回入って遅いので、区分ごとにまとめて 1 ページで確かめる
const GROUPS = [
  ['本物のバッドビート・バッドビート（90% と 75% の境界を含む）', [0, 1, 2, 3]],
  ['よくある負け・コインフリップ（75% と 55% の境界を含む）', [4, 5, 6, 7, 8]],
  ['クーラー（45% の境界・強いペア・KK 対 AA）', [9, 10, 11, 12]],
  ['説教・重症の説教（8% の境界を含む）', [13, 14, 15, 16, 17]],
  ['フロップ・ターンでオールインした場面（クーラー・説教・重症・リバーの 2 アウター）', [18, 19, 20, 21]],
  ['勝ち・引き分け', [22, 23]]
];
for (const [groupName, idx] of GROUPS) {
  test('区分: ' + groupName, async ({ page }) => {
    test.setTimeout(120000);
    await openApp(page);
    for (const i of idx) {
      const [name, input, key, templ] = CASES[i];
      await test.step(name, async () => {
        await setTone(page, 'rough');
        const rough = await judge(page, input);
        expect(rough.title, name + ' 荒めの見出し').toBe(R[key][0]);
        expect(rough.chip, name + ' 荒めのチップ').toBe(R[key][1]);
        if (templ) expect(matchesAny(LINES.rough[key], rough.line), 'セリフが ' + key + ' の雛形のどれか: ' + rough.line).toBe(true);
        expect(rough.text, '差し込みの { } が残っていない').not.toMatch(/[{}]/);
        await setTone(page, 'gentle');
        const gentle = await judge(page, input);
        expect(gentle.title, name + ' やさしめの見出し').toBe(G[key][0]);
        expect(gentle.chip, name + ' やさしめのチップ').toBe(G[key][1]);
        expect(gentle.text, 'やさしめでも { } が残っていない').not.toMatch(/[{}]/);
        if (templ) expect(matchesAny(LINES.gentle[key], gentle.line), 'やさしめのセリフが ' + key + ' の雛形のどれか: ' + gentle.line).toBe(true);
      });
    }
  });
}

test('判定カードに手札・ボード・計算した通り数が出る（プリフロ 1,712,304 通り、フロップ 990 通り）', async ({ page }) => {
  await openApp(page);
  await judge(page, 'AA vs KK');
  let v = page.locator('.verdict').last();
  await expect(v.locator('.eq-label')).toContainText('プリフロップでオールインした時点');
  await expect(v.locator('.eq-count')).toHaveText('1,712,304通りを計算');
  await expect(v.locator('.hands')).toContainText('自分');
  await expect(v.locator('.hands')).toContainText('相手');
  await judge(page, 'AhAs vs KdKc フロップでオールイン Qh 7c 2d');
  v = page.locator('.verdict').last();
  await expect(v.locator('.eq-label')).toContainText('フロップでオールインした時点');
  await expect(v.locator('.eq-count')).toHaveText('990通りを計算');
  await expect(v.locator('.hands')).toContainText('ボード');
  await judge(page, 'AhAs vs KdKc ターンでオールイン Qh 7c 2d 3s');
  await expect(page.locator('.verdict').last().locator('.eq-count')).toHaveText('44通りを計算');
});

test('勝率の数字: AA vs KK は自分 81.1%・相手 18.x% と出る', async ({ page }) => {
  await openApp(page);
  await judge(page, 'AA vs KK');
  const v = page.locator('.verdict').last();
  await expect(v.locator('.hn')).toHaveText(/^自分 81\.\d%$/);
  await expect(v.locator('.vn')).toHaveText(/^相手 1[78]\.\d%$/);
  await expect(v.locator('.v-line')).toContainText('AAでKKに捕まったなら');
});
