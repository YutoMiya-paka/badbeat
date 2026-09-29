/*
 * デプロイ手順（どちらか）:
 *  A. シートから作る: スプレッドシート → 拡張機能 > Apps Script に貼る（SHEET_ID は空のままでよい）
 *  B. 単体で作る: script.google.com > 新しいプロジェクト に貼り、下の SHEET_ID にシートの ID を入れる
 *     （シートの URL の /d/ と /edit の間の文字列）
 * どちらも: 保存 → testWrite を 1 回実行して権限を許可（log タブに test 行が入れば OK）
 *  → デプロイ > 新しいデプロイ > 種類「ウェブアプリ」、実行ユーザー「自分」、アクセス「全員」
 *  → 発行された /exec の URL を index.html の設定値 LOG_ENDPOINT に貼る。
 * ※ 公開リポジトリには SHEET_ID を書かない（自分の Apps Script 側にだけ書く）。
 */
var SHEET_ID = '';

function getSheet_() {
  var ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return null;
  var sheet = ss.getSheetByName('log') || ss.insertSheet('log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['receivedAt', 'v', 'source', 'ok', 'error', 'text', 'hero', 'vill', 'board', 'street', 'autoSuits', 'streetGuessed', 'verdict', 'equity', 'result']);
  }
  return sheet;
}

// エディタから 1 回実行して、権限の許可と書き込みを確かめる用
function testWrite() {
  getSheet_().appendRow([new Date(), 'test', 'text', true, '', 'testWrite から', '', '', '', null, false, false, '', null, '']);
}

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 4096) return output_('ng');
    var p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return output_('ng');

    var fields = [
      ['v', 'string', 20], ['source', 'enum', ['text', 'picker', 'example']], ['ok', 'boolean'],
      ['error', 'string', 200], ['text', 'string', 100], ['hero', 'cards', 4], ['vill', 'cards', 4],
      ['board', 'cards', 10], ['street', 'street'], ['autoSuits', 'boolean'], ['streetGuessed', 'boolean'],
      ['verdict', 'string', 20], ['equity', 'equity'], ['result', 'enum', ['win', 'lose', 'tie', '']]
    ];
    var values = [new Date()];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], value = p[f[0]];
      if (!valid_(value, f[1], f[2])) return output_('ng');
      if (typeof value === 'string') value = safeCell_(value);
      values.push(value);
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      if (!takeQuota_(Date.now())) return output_('ng');
      var sheet = getSheet_();
      if (!sheet) return output_('ng');
      sheet.appendRow(values);
    } finally {
      lock.releaseLock();
    }
    return output_('ok');
  } catch (err) {
    return output_('ng');
  }
}

function valid_(value, type, limit) {
  if (type === 'string') return typeof value === 'string' && value.length <= limit;
  if (type === 'enum') return limit.indexOf(value) !== -1;
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'cards') return typeof value === 'string' && value.length <= limit && /^([2-9TJQKA][shdc])*$/.test(value);
  if (type === 'street') return value === null || value === 0 || value === 3 || value === 4;
  if (type === 'equity') return value === null || (typeof value === 'number' && isFinite(value) && value >= 0 && value <= 1);
  return false;
}

// 先頭の空白・タブ・改行・全角空白を飛ばした 1 文字目が数式の記号なら、先頭に ' を付けて文字列として保存する
function safeCell_(value) {
  var head = value.replace(/^[\s　]+/, '');
  return /^[=+\-@＝＋－＠]/.test(head) ? "'" + value : value;
}

// ---------- 受信数の上限（誰でも送れる受け口なので、全体の量をサーバー側で絞る） ----------
var LIMIT_PER_MINUTE = 30;
var LIMIT_PER_DAY = 3000;

// 今の件数で、もう 1 件受け付けてよいか
function withinLimit_(minuteCount, dayCount) {
  return minuteCount < LIMIT_PER_MINUTE && dayCount < LIMIT_PER_DAY;
}
function minuteKey_(now) { return 'm' + Math.floor(now / 60000); }
function dayKey_(now) { return 'd' + Math.floor(now / 86400000); }

// 上限内なら 1 件分数えて true。ロックの中で呼ぶ。
// 分の件数はキャッシュ（消えても害は小さい）、日の件数はスクリプトのプロパティに置く（キャッシュは 6 時間で消えるため）
function takeQuota_(now) {
  var cache = CacheService.getScriptCache();
  var props = PropertiesService.getScriptProperties();
  var mKey = minuteKey_(now), dKey = dayKey_(now);
  var minuteCount = Number(cache.get(mKey)) || 0;
  var day = JSON.parse(props.getProperty('quotaDay') || '{}');
  var dayCount = day.key === dKey ? day.count : 0;
  if (!withinLimit_(minuteCount, dayCount)) return false;
  cache.put(mKey, String(minuteCount + 1), 120);
  props.setProperty('quotaDay', JSON.stringify({ key: dKey, count: dayCount + 1 }));
  return true;
}

// エディタから実行して、数式対策と上限の判定を確かめる用（シートには書き込まない）
function testGuards() {
  var cases = [['=1+1', true], [' =1+1', true], ['\t@x', true], ['　-1', true], ['＝A1', true], ['AA vs KK', false]];
  cases.forEach(function (c) {
    var escaped = safeCell_(c[0]).charAt(0) === "'";
    if (escaped !== c[1]) throw new Error('safeCell_ ' + JSON.stringify(c[0]));
  });
  if (!withinLimit_(29, 2999) || withinLimit_(30, 0) || withinLimit_(0, 3000)) throw new Error('withinLimit_');
  Logger.log('testGuards OK');
}

function output_(value) {
  return ContentService.createTextOutput(value);
}

// node からテストするための出口（Apps Script では module が無いので何もしない）
if (typeof module !== 'undefined') module.exports = { safeCell_: safeCell_, valid_: valid_, withinLimit_: withinLimit_, minuteKey_: minuteKey_, dayKey_: dayKey_ };
