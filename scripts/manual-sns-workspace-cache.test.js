const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'scripts', 'features', 'social', 'manual-workspace-cache.js'), 'utf8');

function createRuntime() {
  const values = new Map();
  const localStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
  const context = vm.createContext({ localStorage });
  vm.runInContext(`${source}\n;globalThis.cacheApi = { readManualSnsWorkspaceCache, persistManualSnsWorkspaceCache, clearManualSnsWorkspaceCache, shouldInvalidateManualSnsWorkspaceCache };`, context);
  return { api: context.cacheApi, values };
}

test('SNS workspace cache persists only normalized public metadata', () => {
  const { api, values } = createRuntime();
  const now = 2_000_000_000_000;
  const snapshot = api.persistManualSnsWorkspaceCache({
    organizations: [{ id: ' org-1 ', name: ' Team ', apiKey: 'secret' }],
    organizationId: 'org-1',
    channels: [{ id: ' channel-1 ', name: ' Threads ', service: 'THREADS', limit: 500, max_assets: 10, token: 'secret' }]
  }, now);

  assert.equal(snapshot.organizationId, 'org-1');
  assert.equal(snapshot.channels[0].service, 'threads');
  const stored = values.get('manual_sns_workspace_snapshot_v1');
  assert.doesNotMatch(stored, /secret|apiKey|token/);
  assert.deepEqual(JSON.parse(stored).organizations, [{ id: 'org-1', name: 'Team' }]);
});

test('SNS workspace cache reports freshness and retains stale snapshots for revalidation', () => {
  const { api } = createRuntime();
  const now = 2_000_000_000_000;
  api.persistManualSnsWorkspaceCache({ organizations: [{ id: 'org-1' }], organizationId: 'org-1', channels: [] }, now);

  assert.equal(api.readManualSnsWorkspaceCache(now + 60_000).isFresh, true);
  const stale = api.readManualSnsWorkspaceCache(now + 25 * 60 * 60 * 1000);
  assert.equal(stale.isFresh, false);
  assert.equal(stale.organizationId, 'org-1');
});

test('SNS workspace cache rejects corrupted ownership and invalidates only authoritative client failures', () => {
  const { api, values } = createRuntime();
  values.set('manual_sns_workspace_snapshot_v1', JSON.stringify({
    version: 1,
    fetchedAt: 2_000_000_000_000,
    organizations: [{ id: 'org-1' }],
    organizationId: 'other-org',
    channels: []
  }));
  assert.equal(api.readManualSnsWorkspaceCache(2_000_000_000_100), null);
  assert.equal(values.has('manual_sns_workspace_snapshot_v1'), false);
  assert.equal(api.shouldInvalidateManualSnsWorkspaceCache({ status: 401 }), true);
  assert.equal(api.shouldInvalidateManualSnsWorkspaceCache({ status: 400 }), true);
  assert.equal(api.shouldInvalidateManualSnsWorkspaceCache({ status: 429 }), false);
  assert.equal(api.shouldInvalidateManualSnsWorkspaceCache({ status: 503 }), false);
  assert.equal(api.shouldInvalidateManualSnsWorkspaceCache({ status: 0 }), false);
});
