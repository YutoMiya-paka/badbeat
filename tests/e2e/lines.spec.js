// 特別セリフ（AA 対 KK、KK 対 AA、リバー 1〜2 アウター、ターンまで有利）と、勝ち・引き分けの文面。
const { test, expect } = require('@playwright/test');
const { openApp, judge, setTone, loadLines, matchesAny, webkitFilter } = require('./helpers');
webkitFilter(test, { keep: ['特別セリフ:'] });
test.describe.configure({ timeout: 120000 });

const LINES = loadLines();

test('特別セリフ: 見本・AA 対 KK・KK 対 AA・リバーの 1〜2 アウター・ターンまで有利（荒め・やさしめ）', async ({ page }) => {
  await openApp(page);
  await test.step('起動時の見本（AA vs KK）は特別セリフ「AAでKKに捕まったなら」になる', async () => {
    await expect(page.locator('.verdict').first().locator('.v-line')).toContainText('AAでKKに捕まったなら、胸を張れ。');
    await expect(page.locator('.verdict').first().locator('.v-title')).toHaveText('バッドビート');
  });

  await test.step('AA 対 KK（プリフロ）: 荒め・やさしめの特別セリフ', async () => {
    await setTone(page, 'rough');
    const r = await judge(page, 'AA vs KK');
    expect(r.line).toMatch(/^AAでKKに捕まったなら、胸を張れ。5\.4回に1回の方を引いただけだ。/);
    await setTone(page, 'gentle');
    const g = await judge(page, 'AA vs KK');
    expect(g.line).toMatch(/^AAでKKに負けたのですね。オールインした判断は正しかったです。5\.4回に1回ほど起こる結果です。/);
    expect(g.text).not.toMatch(/[{}]/);
  });

  await test.step('KK 対 AA（プリフロ）: 荒め・やさしめの特別セリフ', async () => {
    await setTone(page, 'rough');
    const r = await judge(page, 'KK vs AA');
    expect(r.line).toBe('KKでAAに当たるのは事故だ。その手でプリフロップに降りろとは、俺も言えねえ。');
    expect(r.title).toBe('クーラー');
    await setTone(page, 'gentle');
    const g = await judge(page, 'KK vs AA');
    expect(g.line).toBe('KKでAAに当たるのは厳しい結果です。その手でプリフロップに降りるのは難しい場面だったと思います。');
  });

  await test.step('AA 対 KK でも、プリフロ以外（ターンでオールイン）では特別セリフにならない', async () => {
    await setTone(page, 'rough');
    const r = await judge(page, 'AhAs vs KdKc ターンでオールイン Qh 7c 2d Ks 9s');
    expect(r.line).not.toContain('AAでKKに捕まった');
    expect(matchesAny(LINES.rough.dead, r.line)).toBe(true);
  });

  await test.step('リバーで相手を救う札が 2 枚だけ: 荒め・やさしめの特別セリフと、くわしくの「残り44枚中2枚」', async () => {
    await setTone(page, 'rough');
    const input = 'AhAs vs KdKc フロップでオールイン Qh 7c 2d 3s Kh';
    const r = await judge(page, input);
    expect(r.line).toMatch(/^ターンの時点で、相手を救う札は残り44枚中2枚だけだった。それを引かれた。|^救いの札は2枚しかなかった。それが落ちてきたなら、今日はその2枚の日だ。/);
    await expect(page.locator('.verdict').last().locator('.facts')).toContainText('残り44枚中2枚');
    await setTone(page, 'gentle');
    const g = await judge(page, input);
    expect(g.line).toMatch(/^ターン時点で相手が逆転できる札は、残り44枚中2枚でした。|^逆転の札は2枚だけでした。/);
    expect(g.text).not.toMatch(/[{}]/);
  });

  await test.step('リバーで相手を救う札が 1 枚だけ: 「残り44枚中1枚」', async () => {
    await setTone(page, 'rough');
    const r = await judge(page, 'AhAs vs 2c2d フロップでオールイン Ac 2h 9d 7s 2s');
    expect(r.line).toMatch(/^ターンの時点で、相手を救う札は残り44枚中1枚だけだった。|^救いの札は1枚しかなかった。それが落ちてきたなら、今日はその1枚の日だ。/);
    await expect(page.locator('.verdict').last().locator('.facts')).toContainText('残り44枚中1枚');
    await expect(page.locator('.verdict').last().locator('.facts')).toContainText('リバーで引かれる確率 2.3%');
  });

  await test.step('ターンまで有利で、救う札が 3 枚以上: 「ターンまでは前だった」系のセリフ', async () => {
    await setTone(page, 'rough');
    const input = 'AhAs vs 6d5d フロップでオールイン 4d 3c 9s Kh 2d';
    const r = await judge(page, input);
    expect(r.line).toMatch(/^ターンまではお前が前だった。最後の1枚で持っていかれた。|^リバーさえ来なけりゃ勝ってた。/);
    await expect(page.locator('.verdict').last().locator('.facts')).toContainText('残り44枚中8枚');
    await setTone(page, 'gentle');
    const g = await judge(page, input);
    expect(g.line).toMatch(/^ターンまでは有利でしたが、最後の1枚で逆転されました。|^リバーで結果が変わりました。/);
    await expect(page.locator('.verdict').last().locator('.facts')).toContainText('残り44枚中8枚');
  });
});

for (const [name, input, key, label] of [
  ['勝っている', 'AhAs vs 7d2c フロップでオールイン 8h 3c 4d 5s 9s', 'won', '勝ち'],
  ['引き分け', 'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c', 'chop', '分け']
]) {
  test('ボード 5 枚で' + name + 'とき: 負け向けの文面・休憩の声かけ・「相手が勝つのは」が出ない（荒め・やさしめ）', async ({ page }) => {
    await openApp(page, { hash: '#gentle' });
    // 先に負けを 2 回入れて、3 回目が勝ち・引き分けでも休憩が出ないことを確かめる
    await judge(page, 'AK vs AA');
    await judge(page, '72o vs AA');
    const g = await judge(page, input);
    expect(matchesAny(LINES.gentle[key], g.line)).toBe(true);
    expect(g.notes.join('')).not.toContain('休憩');
    expect(g.text).not.toMatch(/休憩|バッドビートではありません|相手が勝つのは|最終的な役|逆転されました/);
    await expect(page.locator('.verdict').last().locator('.tl-row').last()).toContainText(label);
    await setTone(page, 'rough');
    const r = await judge(page, input);
    expect(matchesAny(LINES.rough[key], r.line)).toBe(true);
    expect(r.text).not.toMatch(/相手が勝つのは|最後の役|お前が勝てるのは|逆転された|バッドビートだ|よくある負け|厄日/);
    expect(r.text).not.toMatch(/[{}]/);
  });
}
