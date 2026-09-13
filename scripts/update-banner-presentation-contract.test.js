const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('update banner exposes semantic states without inline or JavaScript-owned presentation', () => {
  const html = read('ui/index.html');
  const banner = html.match(/<div id="update-banner"[\s\S]*?<\/div>\s*<\/div>\s*<!-- @include partials\/views\/dashboard\.html -->/)?.[0] || '';
  const runtime = read('ui/scripts/features/shell/update.js');
  const styles = read('ui/styles/components/app-chrome.css');

  assert.match(banner, /data-update-state="available"/);
  assert.match(banner, /<progress id="update-progress-bar"[^>]*max="100"[^>]*value="0"/);
  assert.doesNotMatch(banner, /\sstyle=/);
  assert.doesNotMatch(runtime, /\.style\b|setAttribute\(['"]style/);
  assert.match(runtime, /function setUpdateBannerState\(state = 'available'\)/);
  assert.match(runtime, /progressBar\.value = pct/);
  assert.match(styles, /\.update-banner\[data-update-state="downloading"\]/);
  assert.match(styles, /\.update-banner\[data-update-state="applying"\]/);
  assert.match(styles, /\.update-banner\[data-update-state="error"\]/);
});
