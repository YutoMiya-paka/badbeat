// テスト用ブラウザ（Chromium・WebKit）を、このフォルダの node_modules の中に入れる
// （PLAYWRIGHT_BROWSERS_PATH=0 でユーザーのキャッシュではなく node_modules 配下に置く）
const { spawnSync } = require('child_process');
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium', 'webkit'], {
  stdio: 'inherit', shell: process.platform === 'win32', env: Object.assign({}, process.env, { PLAYWRIGHT_BROWSERS_PATH: '0' })
});
process.exit(r.status || 0);
