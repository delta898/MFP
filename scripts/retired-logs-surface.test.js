const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('retired logs UI is absent while the shared dashboard activity API remains available', () => {
  const shell = read('ui/index.html');
  const navigation = read('ui/scripts/foundation/navigation.js');
  const app = read('ui/app.js');
  const progress = read('ui/scripts/foundation/progress-state.js');

  assert.doesNotMatch(shell, /data-view="logs"|partials\/views\/logs\.html/);
  assert.doesNotMatch(navigation, /viewName === 'logs'/);
  assert.doesNotMatch(app, /features\/shell\/(?:activity-logs|system-logs|log-state)\.js/);
  assert.match(progress, /\/api\/v1\/dashboard\/logs/);
});
