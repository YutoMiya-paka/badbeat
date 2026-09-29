// 1 日まとめ: 聞き返しの全パターンと、結果の数字（engine を node で呼んだ期待値と突き合わせる）。
// 1 テストごとにページを開き直すと、起動時の見本の計算が毎回入って遅いので、関連する流れは 1 ページでまとめて確かめる（test.step で区切る）。
const { test, expect } = require('@playwright/test');
const { openApp, judge, ask, payloads, dayExpect, DAY_TITLE, DAY_TITLE_GENTLE, webkitFilter } = require('./helpers');
webkitFilter(test, { keep: ['基本の流れ'] });
test.describe.configure({ timeout: 120000 });

const Q_ALL = '何回オールインして、何回負けた？（例：5回中3回）';
const askAll = k => 'は、全部で何回オールインした？ 負けは' + k + '回と聞いてる。（全部負けなら「全部」）';
const luckCount = page => page.locator('.luck').count();

// 最後の判定カード（1 日まとめの結果）を期待値と比べる
async function expectDayResult(page, exp, gentle) {
  const v = page.locator('.verdict').last();
  await expect(v.locator('.luck')).toBeVisible();
  await expect(v.locator('.luck-label')).toHaveText(gentle ? '今日と同じか、それ以上に負ける確率' : '今日と同じか、もっと悪い負け方になる確率');
  await expect(v.locator('.luck-num')).toHaveText(exp.num);
  await expect(v.locator('.luck-sub')).toHaveText('オールイン ' + exp.nTotal + '回で ' + exp.K + '回負け' +
    (exp.odds ? (gentle ? '（' + exp.odds + '日に1日ほど）' : '（' + exp.odds + '日に1日の負け方）') : ''));
  await expect(v.locator('.v-title')).toHaveText((gentle ? DAY_TITLE_GENTLE : DAY_TITLE)[exp.band]);
  expect(await v.innerText()).not.toMatch(/[{}]/);
}

test('基本の流れ: 聞き返し → 数字／「全部」／全角・漢字 → 結果。区分（ちょっとついてない・ついてない・歴史的に不運）', async ({ page }) => {
  await openApp(page);
  await test.step('KK で 3 回負けた → 聞き返し → 「4回」で結果（数字は engine の計算と一致）', async () => {
    const q = await ask(page, 'KKで3回負けた');
    await expect(q).toContainText('KK' + askAll(3));
    await expect(q.locator('.di-hand')).toHaveText('KK');
    await expect(q).toContainText('分からなければ「わからない」でいい。その手は外して計算する。');
    expect(await luckCount(page)).toBe(0);
    await ask(page, '4回');
    const exp = dayExpect('KKで3回負けた', { 0: { n: 4 } });
    expect(exp.band).toBe('slight');
    await expectDayResult(page, exp, false);
    const item = page.locator('.verdict').last().locator('.day-item');
    await expect(item).toHaveCount(1);
    await expect(item.locator('.di-hand')).toHaveText('KK');
    await expect(item.locator('.di-vs')).toHaveText('vs よくある相手の手');
    await expect(item.locator('.di-nums')).toHaveText(exp.items[0].nums);
    await expect(item.locator('.di-tail')).toHaveText(exp.items[0].tailText);
    await expect(page.locator('.verdict').last().locator('.note')).toContainText('99以上のペア、AJs以上、KQs、AQo以上');
  });
  await test.step('「全部」: 負けの回数がそのまま総数になる（KK 3 回全部負け → ついてない日）', async () => {
    await ask(page, 'KKで3回負けた');
    await ask(page, '全部');
    const exp = dayExpect('KKで3回負けた', { 0: { n: 3 } });
    expect(exp.band).toBe('bad');
    await expectDayResult(page, exp, false);
  });
  await test.step('歴史的に不運な日の区分（AA で 3 回全部負け）', async () => {
    await ask(page, 'AAで3回負けた');
    await ask(page, '全部');
    const exp = dayExpect('AAで3回負けた', { 0: { n: 3 } });
    expect(exp.band).toBe('worst');
    await expectDayResult(page, exp, false);
  });
  await test.step('数字が全角・漢字でもよい（「４回」「四回」）', async () => {
    await ask(page, 'KKで3回負けた');
    await ask(page, '４回');
    await expect(page.locator('.luck-sub').last()).toHaveText(/^オールイン 4回で 3回負け/);
    await ask(page, 'KKで3回負けた');
    await ask(page, '四回');
    await expect(page.locator('.luck-sub').last()).toHaveText(/^オールイン 4回で 3回負け/);
  });
});

test('聞き返しの言い直し: 負けより少ない数・300 超（300 ちょうどは受け付ける）', async ({ page }) => {
  await openApp(page);
  await ask(page, 'KKで3回負けた');
  let b = await ask(page, '2回');
  await expect(b).toHaveText('負けが3回なら、オールインは3回以上のはずだ。もう一回教えてくれ。');
  expect(await luckCount(page)).toBe(0);
  b = await ask(page, '301回');
  await expect(b).toHaveText('さすがに多すぎる。1日のオールインの回数を教えてくれ。');
  expect(await luckCount(page)).toBe(0);
  await ask(page, '4回');
  await expectDayResult(page, dayExpect('KKで3回負けた', { 0: { n: 4 } }), false);
  await ask(page, 'KKで3回負けた');
  await ask(page, '300回');
  await expect(page.locator('.luck-sub').last()).toHaveText(/^オールイン 300回で 3回負け/);
});

test('「わからない」と 2 つの手: すべて外すと計算できない・片方だけ外す・順に聞き返して合算', async ({ page }) => {
  const posts = await openApp(page);
  await test.step('すべて外すと計算できない（記録は daily_nocount）', async () => {
    await ask(page, 'KKで3回負けた');
    const b = await ask(page, 'わからない');
    await expect(b).toHaveText('回数が分かる勝負が1つもないから、計算できなかった。');
    expect(await luckCount(page)).toBe(0);
    const p = payloads(posts).at(-1);
    expect(p.ok).toBe(false); expect(p.error).toBe('daily_nocount'); expect(p.verdict).toBe('daily');
  });
  await test.step('片方は「わからない」で外し、もう片方だけで計算する', async () => {
    const q = await ask(page, 'KKで3回負けた、AKも8回中5回');
    await expect(q).toContainText('KK' + askAll(3));
    await ask(page, 'わからない');
    const exp = dayExpect('KKで3回負けた、AKも8回中5回', {}, [0]);
    await expectDayResult(page, exp, false);
    const items = page.locator('.verdict').last().locator('.day-item');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('回数が分からないので外した');
    await expect(items.nth(1).locator('.di-nums')).toHaveText(exp.items[1].nums);
  });
  await test.step('聞き返しが 1 つずつ順に来て、合算した結果になる', async () => {
    await ask(page, 'KKで3回負けた、AKも何回も負けた');
    await expect(page.locator('.row.bot .bubble').last()).toContainText('KK' + askAll(3));
    const q2 = await ask(page, '5回');
    await expect(q2).toContainText('AK' + 'で' + Q_ALL);
    await ask(page, '6回中4回');
    const exp = dayExpect('KKで3回負けた、AK何回も負けた', { 0: { n: 5 }, 1: { n: 6, k: 4 } });
    await expectDayResult(page, exp, false);
    await expect(page.locator('.verdict').last().locator('.day-item')).toHaveCount(2);
  });
});

test('数字の無い返事は新しい相談として扱う（判定・雑談・あいさつ）。聞き返しは終わる', async ({ page }) => {
  await openApp(page);
  await ask(page, 'KKで3回負けた');
  const v = await judge(page, 'AA vs KK');
  expect(v.title).toBe('バッドビート');
  expect(await luckCount(page)).toBe(0);
  // 聞き返しは終わっているので、次の「4回」は 1 日まとめの続きではなく新しい入力（1 日まとめの手が無い）
  let b = await ask(page, '4回');
  await expect(b).toHaveText('どの手で負けたのか読めなかった。「KKで5回中3回負けた」みたいに、手と回数を書いてくれ。');
  await ask(page, 'KKで3回負けた');
  b = await ask(page, 'こんにちは');
  await expect(b).toContainText('おう、座れ。負けたハンドを見せてみろ。');
  expect(await luckCount(page)).toBe(0);
});

test('「AK何回も負けた」: 何回オールインして何回負けた？ → 数字 1 つは言い直し・雑談は新しい相談・「6回中4回」で結果', async ({ page }) => {
  await openApp(page);
  const q = await ask(page, 'AK何回も負けた');
  await expect(q).toContainText('AK' + 'で' + Q_ALL);
  let b = await ask(page, '4回');
  await expect(b).toHaveText('回数を2つ教えてくれ。「5回中3回」みたいに。');
  expect(await luckCount(page)).toBe(0);
  await ask(page, '6回中4回');
  const exp = dayExpect('AK何回も負けた', { 0: { n: 6, k: 4 } });
  expect(exp.band).toBe('normal');
  await expectDayResult(page, exp, false);
  await ask(page, 'AK何回も負けた');
  b = await ask(page, 'ふーん');
  await expect(b).toContainText('悪いが、ここはバッドビートの相談所だ。');
  expect(await luckCount(page)).toBe(1);
});

test('回数が全部そろっている入力は聞き返さずに結果が出る（不運じゃねえ／説教）。2 つの手は合算', async ({ page }) => {
  await openApp(page);
  await ask(page, 'KKで5回中1回負けた');
  const exp1 = dayExpect('KKで5回中1回負けた');
  expect(exp1.band).toBe('sekkyo');
  await expectDayResult(page, exp1, false);
  await expect(page.locator('.verdict').last().locator('.di-tag')).toHaveText('順当');
  await expect(page.locator('.verdict').last().locator('.v-chip')).toHaveText('説教');
  await ask(page, 'KKで5回中3回負けた、AKも8回中5回');
  const exp = dayExpect('KKで5回中3回負けた、AKも8回中5回');
  await expectDayResult(page, exp, false);
  const items = page.locator('.verdict').last().locator('.day-item');
  await expect(items).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await expect(items.nth(i).locator('.di-nums')).toHaveText(exp.items[i].nums);
    await expect(items.nth(i).locator('.di-tail')).toHaveText(exp.items[i].tailText);
  }
});

test('やさしめ: 聞き返し・言い直し・結果の文言。1 日まとめは連続負けに数えない（休憩は出ない）', async ({ page }) => {
  await openApp(page, { hash: '#gentle' });
  const q = await ask(page, 'KKで3回負けた');
  await expect(q).toContainText('KKは、全部で何回オールインしましたか？ 負けは3回と伺っています。（全部負けなら「全部」と入力してください）');
  await expect(q).toContainText('分からない場合は「わからない」と入力できます。その手は計算から外します。');
  let b = await ask(page, '2回');
  await expect(b).toHaveText('負けが3回の場合、オールイン回数は3回以上になります。もう一度入力してください。');
  b = await ask(page, '301回');
  await expect(b).toHaveText('回数が多すぎるようです。1日のオールイン回数を確認して入力してください。');
  await ask(page, '4回');
  await expectDayResult(page, dayExpect('KKで3回負けた', { 0: { n: 4 } }), true);
  await expect(page.locator('.verdict').last().locator('.note')).toContainText('相手の手が未入力の勝負は、オールインに応じる典型的な手');
  await ask(page, 'AK何回も負けた');
  b = await ask(page, '4回');
  await expect(b).toHaveText('回数を2つ入力してください。「5回中3回」のようにお願いします。');
  b = await ask(page, 'わからない');
  await expect(b).toHaveText('回数が分かる勝負がなかったため、計算できませんでした。');
  for (let i = 0; i < 3; i++) await ask(page, 'KKで5回中3回負けた');
  await expect(page.getByText('休憩')).toHaveCount(0);
});
