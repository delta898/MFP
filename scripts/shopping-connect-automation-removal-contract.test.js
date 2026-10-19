const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('shopping connect exposes only the available manual quick workflow', () => {
  const view = read('ui/partials/views/shopping.html');
  const navigation = read('ui/scripts/features/shopping/tab-navigation.js');
  const app = read('ui/app.js');

  assert.doesNotMatch(view, /data-shopping-tab="auto"|shopping-tab-auto|shopping-publish-auto/);
  assert.match(navigation, /const allowed = \['quick'\]/);
  assert.doesNotMatch(navigation, /loadShoppingAutoSettings|target === 'auto'/);
  assert.doesNotMatch(app, /automation\/shopping\.js/);
});

test('shopping automation cannot be started through runtime or API composition', () => {
  const runner = read('src/applications/sns/distribution/automation-scheduler.js');
  const cycle = read('src/applications/blog/publishing/selected-topic-batch-publisher.js');
  const snsApplication = read('src/applications/sns/distribution/automation-application.js');
  const contentActions = read('src/adapters/ui/content/content-api/action-handlers.js');
  const routes = read('src/adapters/ui/content/content-api/routes.js');
  const server = read('src/ui-server.js');

  [runner, cycle, snsApplication, contentActions, routes, server].forEach((source) => {
    assert.doesNotMatch(source, /executeShoppingAuto|syncShoppingAuto|shoppingAutoRuntimeState|shopping\/auto\/run-manual/);
  });
  assert.doesNotMatch(runner, /shoppingPublishedToday|scheduleNextShoppingAutoCycle/);
});
