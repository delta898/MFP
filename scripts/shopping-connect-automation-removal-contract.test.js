const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shopping connect exposes only manual quick and batch workflows', () => {
  const view = read('ui/partials/views/shopping.html');
  const navigation = read('ui/scripts/features/content/tab-navigation.js');
  const app = read('ui/app.js');

  assert.doesNotMatch(view, /data-shopping-tab="auto"|shopping-tab-auto|shopping-publish-auto/);
  assert.match(navigation, /const allowed = \['quick', 'batch'\]/);
  assert.doesNotMatch(navigation, /loadShoppingAutoSettings|target === 'auto'/);
  assert.doesNotMatch(app, /automation\/shopping\.js/);
});

test('shopping automation cannot be started through runtime or API composition', () => {
  const runner = read('src/ui-runtime/auto-runner-runtime.js');
  const cycle = read('src/ui-runtime/auto-cycle-runtime.js');
  const contentActions = read('src/ui-runtime/content-actions-runtime.js');
  const routes = read('src/ui-api/routes/content.routes.js');
  const server = read('src/ui-server.js');

  [runner, cycle, contentActions, routes, server].forEach((source) => {
    assert.doesNotMatch(source, /executeShoppingAuto|syncShoppingAuto|shoppingAutoRuntimeState|shopping\/auto\/run-manual/);
  });
  assert.doesNotMatch(runner, /shoppingPublishedToday|scheduleNextShoppingAutoCycle/);
});

test('dashboard no longer presents shopping automatic publishing status', () => {
  const dashboardView = read('ui/partials/views/dashboard.html');
  const dashboardController = read('ui/scripts/features/shell/dashboard.js');

  assert.doesNotMatch(dashboardView, /dash-auto-shopping|쇼핑 자동발행/);
  assert.doesNotMatch(dashboardController, /auto\?\.shopping|dash-auto-shopping|navigateTo\('shopping', 'auto'\)/);
});
