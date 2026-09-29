// 画面テスト共通の道具。
// 記録の送信先（本番の Google Apps Script）は、どのテストでも必ず page.goto の前に止める。
const fs = require('fs');
const path = require('path');

const LOG_URL_GLOB = 'https://script.google.com/**';

// 記録の受け口を偽物にする。送られた本文は posts に入る（body は JSON 文字列）。
async function installSafeRoutes(page, options = {}) {
  const posts = options.posts || [];
  await page.route(LOG_URL_GLOB, async route => {
    posts.push({ url: route.request().url(), body: route.request().postData() });
    if (options.abort) return route.abort();
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
  });
  return posts;
}

// 記録の本文を JSON にして返す
function payloads(posts) { return posts.map(p => JSON.parse(p.body)); }

// アプリを開いて、起動時の見本の判定が終わるまで待つ。
// options: hash（'#gentle' など）, posts（記録の受け取り配列）, abort（送信を失敗させる）, wait（false で待たない）
async function openApp(page, options = {}) {
  const posts = options.posts || [];
  await installSafeRoutes(page, { posts, abort: options.abort });
  await page.goto('/' + (options.hash || ''));
  if (options.wait !== false) await waitSampleDone(page);
  return posts;
}
// 見本の判定が終わると「ここから下が…」の札が出て、送信ボタンが使える
async function waitSampleDone(page) {
  await page.waitForFunction(() => document.querySelectorAll('.sample-tag').length >= 2);
  await page.waitForFunction(() => { const b = document.querySelector('#send'); return b && !b.disabled; });
}
async function waitIdle(page) {
  await page.waitForFunction(() => { const b = document.querySelector('#send'); return b && !b.disabled; });
}

// 入力欄に書いて送信し、計算が終わって送信ボタンが戻るまで待つ
async function send(page, text) {
  await waitIdle(page);
  await page.locator('#msg').fill(text);
  await page.locator('#send').click();
}
// 送信して、bot の吹き出しが 1 つ増えるまで待つ（判定に限らない返事用）
async function ask(page, text) {
  const prior = await page.locator('.row.bot').count();
  await send(page, text);
  await page.waitForFunction(n => document.querySelectorAll('.row.bot').length > n, prior);
  await waitIdle(page);
  return page.locator('.row.bot .bubble').last();
}
// 送信して、判定カード（.verdict）が 1 つ増えるまで待つ
async function judge(page, text) {
  const prior = await page.locator('.verdict').count();
  await send(page, text);
  await page.waitForFunction(n => document.querySelectorAll('.verdict').length > n, prior);
  await waitIdle(page);
  return readVerdict(page);
}
async function bubbleText(page) { return (await page.locator('.row.bot .bubble').last().innerText()).replace(/\s+/g, ' ').trim(); }

// 最後の判定カードの中身
async function readVerdict(page) {
  const v = page.locator('.verdict').last();
  return {
    title: (await v.locator('.v-title').innerText()).trim(),
    chip: (await v.locator('.v-chip').innerText()).trim(),
    line: (await v.locator('.v-line').innerText()).trim(),
    notes: await v.locator('p.note').allInnerTexts(),
    text: (await v.innerText()).replace(/\s+/g, ' ').trim(),
    html: await v.innerHTML()
  };
}

async function setTone(page, tone) {
  const now = await page.locator('#toneToggle').getAttribute('aria-pressed');
  if ((now === 'true') !== (tone === 'gentle')) await page.locator('#toneToggle').click();
}

// index.html の LINES / LINES_GENTLE（セリフの雛形）を読み出す（読み取りだけ）
function loadLines() {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const grab = name => {
    const m = src.match(new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\n  \\});'));
    if (!m) throw new Error(name + ' が index.html から取り出せない');
    return new Function('return ' + m[1])();
  };
  return { rough: grab('LINES'), gentle: grab('LINES_GENTLE') };
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// 雛形（{E} など）を正規表現にする
function templateRe(tpl) {
  return new RegExp('^' + tpl.split(/\{\w+\}/).map(escapeRe).join('.+?') + '$');
}
// 同情の判定が続いたときはセリフの末尾に 1 日まとめの案内が付くので、それを除いて雛形と比べる
const DAILY_HINT_RE = / (今日は厄日だな。|何度か続いた場合は、).*$/;
function stripDailyHint(text) { return text.replace(DAILY_HINT_RE, ''); }
function matchesAny(templates, text) { const t = stripDailyHint(text); return templates.some(x => templateRe(x).test(t)); }

// Apps Script（tools/apps-script.gs）を node に読み込む（tools/test-apps-script.js と同じ方法）
function loadAppsScript() {
  const Module = require('module');
  const file = path.join(__dirname, '..', '..', 'tools', 'apps-script.gs');
  const m = new Module(file, module);
  m.filename = file;
  m._compile(fs.readFileSync(file, 'utf8'), file);
  return m.exports;
}



// 受け口の doPost を、Google のサービスを偽物にして丸ごと通す（tools/test-apps-script.js と同じ偽物の作り方）。
// 戻り値: { post(obj|文字列) -> 'ok'|'ng', rows, G }
function loadAppsScriptFull() {
  const Module = require('module');
  const rows = [], cache = new Map(), props = new Map();
  global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => ({ getLastRow: () => rows.length, appendRow: r => rows.push(r) }), insertSheet: () => ({ getLastRow: () => rows.length, appendRow: r => rows.push(r) }) }) };
  global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  global.CacheService = { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v) => cache.set(k, v) }) };
  global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props.get(k) || null, setProperty: (k, v) => props.set(k, v) }) };
  global.ContentService = { createTextOutput: text => ({ getContent: () => text }) };
  const file = path.join(__dirname, '..', '..', 'tools', 'apps-script.gs');
  const m = new Module(file, module);
  m.filename = file;
  m._compile(fs.readFileSync(file, 'utf8') + '\nmodule.exports.doPost = doPost;', file);
  return {
    G: m.exports, rows,
    post(body) {
      cache.clear(); props.clear(); // 上限（1 分 30 件）に掛からないよう毎回まっさらにする
      const raw = typeof body === 'string' ? body : JSON.stringify(body);
      return m.exports.doPost({ postData: { contents: raw } }).getContent();
    }
  };
}

// ---------- 1 日まとめの期待値（engine を node で呼んで、画面の数字と突き合わせる） ----------
function loadEngine() {
  require('../../engine.js');
  return globalThis.PokerEngine;
}
function pctStr(x) { const v = x * 100; return v > 0 && v < 0.1 ? '0.1%未満' : v.toFixed(1) + '%'; }
function oddsStr(p) { if (p <= 0) return null; const v = 1 / p; return v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toString(); }
function dayBand(t) { return t < 0.01 ? 'worst' : t < 0.05 ? 'bad' : t < 0.2 ? 'slight' : t < 0.5 ? 'normal' : 'sekkyo'; }
const DAY_TITLE = { worst: '歴史的に不運な日', bad: 'ついてない日', slight: 'ちょっとついてない日', normal: '普通の日', sekkyo: '不運じゃねえ' };
const DAY_TITLE_GENTLE = { worst: 'とても不運な日', bad: 'ついていない日', slight: '少しついていない日', normal: '通常の日', sekkyo: '不運な日ではありません' };
// text は最初の入力、fix は { 手の番号: { n, k } }（聞き返しへの答えで決まる回数）。skip は外す手の番号の配列
function dayExpect(text, fix = {}, skip = []) {
  const PE = loadEngine();
  const d = PE.parseDaily(text), list = [], items = [];
  let K = 0;
  d.items.forEach((it, i) => {
    if (skip.includes(i)) { items.push({ label: it.label, skipped: true }); return; }
    const f = fix[i] || {};
    const n = f.n !== undefined ? f.n : it.n, k = f.k !== undefined ? f.k : it.k;
    const he = PE.handEquity(it.hero, it.vill, 30000);
    const p = he.tie < 1 ? he.lose / (1 - he.tie) : 0; // 画面と同じく引き分けを除いた負けの確率（v1.4.4）
    const tail = PE.binomTail(n, k, p);
    list.push({ n, p }); K += k;
    items.push({ label: it.label, n, k, p, tail, band: dayBand(tail), nums: n + '回中 ' + k + '回負け。1回あたり負ける確率 ' + pctStr(p) + '、普通なら ' + (n * p).toFixed(1) + '回', tailText: 'これ以上負ける確率 ' + pctStr(tail) });
  });
  const t = list.length ? PE.sumTail(list, K) : null;
  const nTotal = list.reduce((a, x) => a + x.n, 0);
  return { items, t, band: t === null ? null : dayBand(t), num: t === null ? null : pctStr(t), nTotal, K, odds: t === null ? null : oddsStr(t) };
}

// 判定 9 区分の代表入力（engine で勝率を確かめた値。E = 勝ち + 引き分け / 2）
const PROBE = {
  real:   'AA vs AKo',                                          // 92.6%
  bad:    'AA vs AKs',                                          // 87.9%
  usual:  'KK vs AKo',                                          // 70.0%
  flip:   '44 vs AKo',                                          // 54.4%
  cooler: 'KK vs AA',                                           // 18.7%
  sekkyo: '72o vs AA',                                          // 12.6%
  dead:   'AK vs AA',                                           // 7.4%
  won:    'AhAs vs 8d7d フロップでオールイン 9d 2c 3s 4h 6d',   // 自分が勝つ
  chop:   'AhKh vs AsKs フロップでオールイン Qc 7d 2d 4h 9c'    // 引き分け
};


// 全体の実行時間を 5 分以内に収めるための取り決め:
// 判定・セリフ・1 日まとめの計算などの「論理」は 3 構成で同じ JS が動くので、論理だけを確かめる重いテストは PC（chromium-desktop）だけで回す。
// スマホ構成（chromium-phone・WebKit の iPhone）では、画面・入力・保存・WebKit のエンジン動作など、構成による差が出やすいテストだけ回す。
// keep: PC 以外でも回すテストの題名の一部 ／ skip: PC 以外で回さないテストの題名の一部（どちらか一方だけ指定する）
const DESKTOP_ONLY_REASON = '時間短縮: 論理だけを確かめるテスト。3 構成で同じ JS が動くので PC 構成だけで回す（構成の差が出やすい画面・入力・保存のテストはスマホ構成でも回している）';
function webkitFilter(test, { keep, skip }) {
  test.beforeEach(async ({}, testInfo) => {
    if (testInfo.project.name === 'chromium-desktop') return;
    const t = testInfo.title;
    const run = keep ? keep.some(k => t.includes(k)) : !skip.some(k => t.includes(k));
    test.skip(!run, DESKTOP_ONLY_REASON);
  });
}

module.exports = {
  installSafeRoutes, webkitFilter, payloads, openApp, waitSampleDone, waitIdle, send, ask, judge, bubbleText, readVerdict, setTone,
  loadLines, templateRe, matchesAny, stripDailyHint, loadEngine, dayExpect, DAY_TITLE, DAY_TITLE_GENTLE, pctStr, oddsStr, loadAppsScript, loadAppsScriptFull, PROBE, LOG_URL_GLOB
};
