// tools/apps-script.gs の、Google のサービスを使わない部分（数式対策・上限の判定・入力チェック）を node で確かめる
// 実行: node tools/test-apps-script.js
const assert = require('assert');
const path = require('path');
const Module = require('module');
const rows = [];
const cache = new Map(), props = new Map();
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({ getSheetByName: () => ({ getLastRow: () => rows.length, appendRow: r => rows.push(r) }), insertSheet: () => ({ getLastRow: () => rows.length, appendRow: r => rows.push(r) }) }) };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.CacheService = { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k,v) => cache.set(k,v) }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => props.get(k) || null, setProperty: (k,v) => props.set(k,v) }) };
global.ContentService = { createTextOutput: text => ({ getContent: () => text }) };

// .gs は拡張子の都合で require できないので、JS として読み込む
const file = path.join(__dirname, 'apps-script.gs');
const m = new Module(file, module);
m.filename = file;
m._compile(require('fs').readFileSync(file, 'utf8') + '\nmodule.exports.doPost = doPost; module.exports.takeQuota_ = takeQuota_;', file);
const G = m.exports;
const doPost = m.exports.doPost;

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

check('doPost accepts valid body and appends one row', () => {
  const before = rows.length;
  const p = { v:'1-g', source:'text', ok:true, error:'', text:'AA vs KK', hero:'AsAh', vill:'KdKc', board:'', street:0, autoSuits:true, streetGuessed:false, verdict:'bad', equity:.81, result:'lose' };
  assert.equal(G.doPost({ postData:{ contents:JSON.stringify(p) } }).getContent(), 'ok');
  assert.equal(rows.length, before + 2); // first write initializes the header row
});
check('doPost rejects malformed body without append', () => {
  const before = rows.length;
  assert.equal(G.doPost({ postData:{ contents:'{' } }).getContent(), 'ng');
  assert.equal(G.doPost({ postData:{ contents:'[]' } }).getContent(), 'ng');
  assert.equal(rows.length, before);
});
check('doPost rejects quota overflow without append', () => {
  cache.clear(); props.clear();
  const before = rows.length;
  G.doPost({ postData:{ contents:'x'.repeat(4097) } });
  const p = { v:'1-g', source:'text', ok:true, error:'', text:'AA vs KK', hero:'AsAh', vill:'KdKc', board:'', street:0, autoSuits:true, streetGuessed:false, verdict:'bad', equity:.81, result:'lose' };
  for(let i=0;i<30;i++) G.doPost({postData:{contents:JSON.stringify(p)}});
  assert.equal(G.doPost({postData:{contents:JSON.stringify(p)}}).getContent(),'ng');
  assert.equal(rows.length, before + 30);
});
check('doPost prefixes formula text before append', () => {
  cache.clear(); props.clear();
  const p = { v:'1-g', source:'text', ok:true, error:'', text:'=1+1', hero:'', vill:'', board:'', street:null, autoSuits:false, streetGuessed:false, verdict:'', equity:null, result:'' };
  assert.equal(G.doPost({postData:{contents:JSON.stringify(p)}}).getContent(),'ok');
  assert.equal(rows.at(-1)[5], "'=1+1");
});

console.log(`${checks} checks OK`);
