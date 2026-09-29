// 手元確認用の簡易サーバー（公開には使わない）
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
http.createServer((req, res) => {
  // 記録送信の手元確認用：POST /log の本文をそのまま表示する
  if (req.method === 'POST' && req.url === '/log') {
    let b = ''; req.on('data', d => b += d); req.on('end', () => { console.log('LOG', b); res.end('ok'); });
    return;
  }
  const p = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, p === '/' ? 'index.html' : p);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    let body = buf;
    if (file.endsWith('index.html') && !/^<!doctype/i.test(buf.toString())) body = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>' + buf + '</body></html>';
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
}).listen(+process.env.PORT || 5173, function () { console.log('http://localhost:' + this.address().port); });
