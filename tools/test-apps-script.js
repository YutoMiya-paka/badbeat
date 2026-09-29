// tools/apps-script.gs の、Google のサービスを使わない部分（数式対策・上限の判定・入力チェック）を node で確かめる
// 実行: node tools/test-apps-script.js
const assert = require('assert');
const path = require('path');
const Module = require('module');

// .gs は拡張子の都合で require できないので、JS として読み込む
const file = path.join(__dirname, 'apps-script.gs');
const m = new Module(file, module);
m.filename = file;
m._compile(require('fs').readFileSync(file, 'utf8'), file);
const G = m.exports;

let checks = 0;
function check(name, fn) { fn(); checks++; }

check('safeCell_ escapes formula starts, including after leading spaces', () => {
  for (const v of ['=1+1', '+1', '-1', '@x', ' =1+1', '\t=1', '\n@x', '\r\n+1', '　=A1', '＝A1', '  ＋1']) {
    assert.strictEqual(G.safeCell_(v), "'" + v, JSON.stringify(v));
  }
  for (const v of ['AA vs KK', 'KKで3回負けた', '', ' 72o vs AA', 'a=b']) {
    assert.strictEqual(G.safeCell_(v), v, JSON.stringify(v));
  }
});

check('withinLimit_ allows up to 30/min and 3000/day', () => {
  assert.ok(G.withinLimit_(0, 0));
  assert.ok(G.withinLimit_(29, 2999));
  assert.ok(!G.withinLimit_(30, 0));
  assert.ok(!G.withinLimit_(0, 3000));
});

check('quota keys change per minute and per day', () => {
  const t = Date.UTC(2026, 8, 29, 12, 0, 30);
  assert.strictEqual(G.minuteKey_(t), G.minuteKey_(t + 20000));
  assert.notStrictEqual(G.minuteKey_(t), G.minuteKey_(t + 60000));
  assert.strictEqual(G.dayKey_(t), G.dayKey_(t + 3600000));
  assert.notStrictEqual(G.dayKey_(t), G.dayKey_(t + 86400000));
});

check('valid_ rejects bad cards and out-of-range values', () => {
  assert.ok(G.valid_('AsAh', 'cards', 4));
  assert.ok(!G.valid_('=A1', 'cards', 4));
  assert.ok(!G.valid_('x'.repeat(101), 'string', 100));
  assert.ok(!G.valid_(1.5, 'equity'));
  assert.ok(!G.valid_('admin', 'enum', ['text', 'picker', 'example']));
});

console.log(`${checks} checks OK`);
