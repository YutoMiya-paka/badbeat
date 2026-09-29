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

function safeCell_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function output_(value) {
  return ContentService.createTextOutput(value);
}
