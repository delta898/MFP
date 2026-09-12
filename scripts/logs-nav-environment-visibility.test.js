const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('logs nav stays hidden until a local or development environment is confirmed', () => {
  const shell = read('ui/index.html');
  const banner = read('ui/scripts/features/shell/setup-banner.js');
  const navigation = read('ui/scripts/foundation/navigation.js');
  const shellNavigation = read('ui/styles/layout/shell-navigation.css');

  assert.match(shell, /<button class="nav-btn" data-view="logs" hidden>/);
  assert.match(shellNavigation, /\.nav-btn\[hidden\]/);
  assert.match(banner, /LOGS_NAV_VISIBLE_ENVIRONMENTS = \['local', 'development'\]/);
  assert.match(banner, /syncLogsNavVisibility\(status\)/);
  assert.match(banner, /button\.hidden = !LOGS_NAV_VISIBLE_ENVIRONMENTS\.includes\(environment\)/);
  assert.match(navigation, /if \(viewName === 'logs'\) \{[\s\S]*?hidden !== false/);
  assert.match(navigation, /if \(viewName === 'logs'\) \{[\s\S]*?await navigateTo\('dashboard-beta'\)/);
});

test('browser smoke fixture exposes a development environment for the logs nav', () => {
  const smoke = read('scripts/test-ui-browser-smoke.js');

  assert.match(smoke, /runtimeEnvironment: \{[\s\S]*?environment: 'development'/);
});
