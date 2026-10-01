import test from 'node:test';
import assert from 'node:assert/strict';
import Cloudflare from 'cloudflare';
import { createAssetManifest, createCloudflareSdkAdapter, redactToken } from './sdk-client.js';

const accountId = '0123456789abcdef0123456789abcdef';

test('lists scripts through the Cloudflare SDK with the selected account', async () => {
  const calls = [];
  const adapter = createCloudflareSdkAdapter({
    client: { workers: { scripts: { list: async (params) => { calls.push(params); return [{ id: 'one' }]; } } } }
  });
  assert.deepEqual(await adapter.listWorkerScripts(accountId), [{ id: 'one' }]);
  assert.deepEqual(calls, [{ account_id: accountId }]);
});

test('Cloudflare SDK sends the OAuth access token as a Bearer credential', async () => {
  const requests = [];
  const client = new Cloudflare({
    apiToken: 'oauth-access-token-for-test',
    maxRetries: 0,
    fetch: async (url, options) => {
      requests.push({ url: String(url), authorization: new Headers(options.headers).get('authorization') });
      return new Response(JSON.stringify({
        success: true,
        result: [{ id: 'sample-worker' }],
        result_info: { page: 1, per_page: 20, total_count: 1 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  });
  const adapter = createCloudflareSdkAdapter({ client });
  const scripts = await adapter.listWorkerScripts(accountId);
  assert.deepEqual(scripts.map((script) => script.id), ['sample-worker']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].authorization, 'Bearer oauth-access-token-for-test');
  assert.match(requests[0].url, new RegExp(`/accounts/${accountId}/workers/scripts`));
});

test('reads the deployment list shape returned by Cloudflare through the SDK', async () => {
  const client = new Cloudflare({
    apiToken: 'test-token',
    maxRetries: 0,
    fetch: async () => new Response(JSON.stringify({
      success: true,
      result: { deployments: [{ id: 'deployment-1', versions: [{ version_id: 'version-1', percentage: 100 }] }] },
      result_info: { page: 1, per_page: 20 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  });
  const adapter = createCloudflareSdkAdapter({ client });
  const deployments = await adapter.listDeployments({ accountId, workerName: 'sample-worker' });
  assert.equal(deployments[0].id, 'deployment-1');
  assert.equal(deployments[0].versions[0].percentage, 100);
});

test('creates a manifest compatible with Cloudflare direct asset upload', () => {
  const { manifest, filesByHash } = createAssetManifest([{ path: 'index.html', content: '<h1>sample</h1>' }]);
  const [assetPath] = Object.keys(manifest);
  assert.equal(assetPath, '/index.html');
  assert.equal(manifest[assetPath].size, Buffer.byteLength('<h1>sample</h1>'));
  assert.equal(filesByHash.get(manifest[assetPath].hash).toString(), '<h1>sample</h1>');
});

test('rejects unsafe and duplicate asset paths', () => {
  assert.throws(() => createAssetManifest([{ path: '../index.html', content: 'x' }]), /relative site paths/);
  assert.throws(() => createAssetManifest([
    { path: 'index.html', content: 'x' },
    { path: '/index.html', content: 'y' }
  ]), /Duplicate static asset path/);
});

test('uses the temporary upload JWT only for the asset-bucket transfer', async () => {
  const calls = [];
  const content = Buffer.from('sample');
  const hash = 'asset-hash';
  const adapter = createCloudflareSdkAdapter({
    client: {},
    fetchImpl: async (url, options) => {
      calls.push({ url, authorization: options.headers.Authorization, fields: [...options.body.keys()] });
      return new Response(JSON.stringify({ success: true, result: { jwt: 'complete-jwt' } }), { status: 200 });
    }
  });
  const result = await adapter.uploadAssetBuckets({
    accountId,
    buckets: [[hash]],
    filesByHash: new Map([[hash, content]]),
    uploadToken: 'upload-jwt'
  });
  assert.equal(result, 'complete-jwt');
  assert.equal(calls[0].authorization, 'Bearer upload-jwt');
  assert.deepEqual(calls[0].fields, [hash]);
});

test('redacts access tokens from diagnostic text', () => {
  assert.equal(redactToken('request failed using secret-access-token', 'secret-access-token'), 'request failed using [redacted]');
});
