# バッドビート相談所

負けたポーカーのハンドを入力すると、オールイン時点の勝率を全通り数えて計算し、本当にバッドビートだったかを判定するチャットです。

- `index.html` … 画面・判定・セリフ
- `engine.js` … 役判定・勝率計算・入力の読み取り
- `tools/test-engine.js` … 計算の回帰テスト（`node tools/test-engine.js`）
- `tools/test-apps-script.js` … 受け口の数式対策・上限判定のテスト（`node tools/test-apps-script.js`）
- `tools/apps-script.gs` … 入力記録を Google スプレッドシートに貯める受け口（設置手順はファイル先頭）
- `tools/serve.js` … 手元確認用サーバー（`node tools/serve.js`）
