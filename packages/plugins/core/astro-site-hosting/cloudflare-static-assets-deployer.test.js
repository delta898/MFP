'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Cloudflare = require('cloudflare');
const { createAssetManifest, createCloudflareSdkAdapter, createCloudflareStaticAssetsDeployer } = require('./cloudflare-static-assets-deployer');

test('static asset manifest maps relative build paths to content hashes', () => {
    const { manifest, filesByHash } = createAssetManifest([{ path: 'index.html', content: '<h1>site</h1>' }]);
    const entry = manifest['/index.html'];
    assert.equal(entry.size, Buffer.byteLength('<h1>site</h1>'));
    assert.equal(filesByHash.get(entry.hash).toString(), '<h1>site</h1>');
    assert.throws(() => createAssetManifest([{ path: '../outside', content: 'x' }]), /올바르지 않은 파일 경로/);
});

test('official SDK adapter sends the OAuth token as a Bearer credential', async () => {
    const requests = [];
    const client = new Cloudflare({
        apiToken: 'oauth-token-test',
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
    const scripts = await adapter.listWorkerScripts('a'.repeat(32));
    assert.equal(scripts[0].id, 'sample-worker');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, 'Bearer oauth-token-test');
    assert.match(requests[0].url, /\/workers\/scripts/);
});

test('Cloudflare adapter reads Worker bindings and DNS records and deletes only the selected binding', async () => {
    const calls = [];
    const client = {
        workers: { domains: {
            list: (args) => { calls.push(['worker-domains-list', args]); return [{ id: 'binding-1', hostname: args.hostname }]; },
            delete: (id, args) => { calls.push(['worker-domains-delete', id, args]); return { id }; },
            update: (args) => { calls.push(['worker-domains-update', args]); return args; }
        }, scripts: { delete: (name, args) => { calls.push(['worker-delete', name, args]); return {}; } } },
        dns: { records: {
            list: (args) => { calls.push(['dns-list', args]); return [{ id: 'record-1', name: args.name }]; }
        } }
    };
    const adapter = createCloudflareSdkAdapter({ client });
    assert.deepEqual(await adapter.listWorkerDomains({ accountId: 'account-1', hostname: 'blog.example.com' }), [
        { id: 'binding-1', hostname: 'blog.example.com' }
    ]);
    assert.deepEqual(await adapter.listDnsRecords({ zoneId: 'zone-1', hostname: 'blog.example.com' }), [
        { id: 'record-1', name: 'blog.example.com' }
    ]);
    await adapter.detachWorkerDomain({ accountId: 'account-1', bindingId: 'binding-1' });
    await adapter.attachWorkerDomain({ accountId: 'account-1', hostname: 'blog.example.com', workerName: 'new-worker', zoneId: 'zone-1' });
    await adapter.deleteWorker({ accountId: 'account-1', workerName: 'bg-site-1' });
    assert.deepEqual(calls, [
        ['worker-domains-list', { account_id: 'account-1', hostname: 'blog.example.com' }],
        ['dns-list', { zone_id: 'zone-1', name: 'blog.example.com', per_page: 100 }],
        ['worker-domains-delete', 'binding-1', { account_id: 'account-1' }],
        ['worker-domains-update', { account_id: 'account-1', hostname: 'blog.example.com', service: 'new-worker', zone_id: 'zone-1' }],
        ['worker-delete', 'bg-site-1', { account_id: 'account-1' }]
    ]);
});

test('deploy uses the connected account with a stable Site ID worker name', async () => {
    const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflare-static-deploy-'));
    try {
        fs.mkdirSync(path.join(siteRoot, 'dist'));
        fs.writeFileSync(path.join(siteRoot, 'dist', 'index.html'), '<h1>deployed site</h1>');
        const calls = [];
        const adapter = {
            getWorkersSubdomain: async (accountId) => { calls.push(['subdomain', accountId]); return 'example'; },
            listWorkerScripts: async (accountId) => {
                calls.push(['list', accountId]);
                return calls.some((item) => item[0] === 'create') ? [{ id: 'bg-site-123', created_on: '2026-10-06T00:00:00Z' }] : [];
            },
            createWorker: async (args) => { calls.push(['create', args.workerName]); return { id: args.workerName }; },
            createAssetUploadSession: async ({ workerName, manifest }) => {
                calls.push(['session', workerName]);
                return { buckets: [[manifest['/index.html'].hash]], jwt: 'upload-token' };
            },
            uploadAssetBuckets: async ({ uploadToken }) => { calls.push(['upload', uploadToken]); return 'completion-token'; },
            createWorkerVersion: async ({ workerId, completionToken }) => {
                calls.push(['version', workerId, completionToken]);
                return { id: 'version-1' };
            },
            createDeployment: async ({ workerName, versionId }) => {
                calls.push(['deploy', workerName, versionId]);
                return { id: 'deployment-1' };
            },
            listDeployments: async ({ accountId, workerName }) => {
                calls.push(['verify', accountId, workerName]);
                return [{ id: 'deployment-1', versions: [{ version_id: 'version-1', percentage: 100 }] }];
            }
        };
        const deployer = createCloudflareStaticAssetsDeployer({
            fs, path,
            getCredentials: async () => ({ accessToken: 'never-return-this', account: { id: 'a'.repeat(32) } }),
            createClient: (token) => { calls.push(['client', token]); return {}; },
            createAdapter: () => adapter,
            sleep: async () => {},
            fetchImpl: async () => new Response('<h1>deployed site</h1>', { status: 200 })
        });
        const result = await deployer.deploy({ id: 'site-123', root_path: siteRoot });
        assert.equal(result.worker_name, 'bg-site-123');
        assert.equal(result.url, 'https://bg-site-123.example.workers.dev/');
        assert.equal(result.deployment_id, 'deployment-1');
        assert.equal(result.managed_by_app, true);
        assert.equal(result.worker_account_id, 'a'.repeat(32));
        assert.equal(result.worker_created_on, '2026-10-06T00:00:00Z');
        assert.deepEqual(calls.map(([name]) => name), ['client', 'subdomain', 'list', 'create', 'list', 'session', 'upload', 'version', 'deploy', 'verify']);
        assert.equal(calls[0][1], 'never-return-this');
        const reconnectedAccountDeploy = await deployer.deploy({
            id: 'site-123', root_path: siteRoot,
            deployment: { ...result, worker_account_id: 'b'.repeat(32) }
        });
        assert.equal(reconnectedAccountDeploy.managed_by_app, false,
            'a Worker in another Cloudflare account must not inherit BlogGenius ownership');
    } finally {
        fs.rmSync(siteRoot, { recursive: true, force: true });
    }
});

test('deploy accepts the explicit environment Worker name while retaining create-or-reuse behavior', async () => {
    const siteRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cloudflare-static-deploy-explicit-'));
    try {
        fs.mkdirSync(path.join(siteRoot, 'dist'));
        fs.writeFileSync(path.join(siteRoot, 'dist', 'index.html'), '<h1>deployed site</h1>');
        const calls = [];
        const adapter = {
            getWorkersSubdomain: async () => 'example',
            listWorkerScripts: async () => [],
            createWorker: async ({ workerName }) => { calls.push(['create', workerName]); return { id: workerName, created_on: '2026-11-05' }; },
            createAssetUploadSession: async ({ workerName, manifest }) => ({ buckets: [[manifest['/index.html'].hash]], jwt: workerName }),
            uploadAssetBuckets: async () => 'completion-token',
            createWorkerVersion: async ({ workerId }) => ({ id: workerId }),
            createDeployment: async ({ workerName }) => ({ id: workerName }),
            listDeployments: async ({ workerName }) => [{ id: workerName, versions: [{ version_id: workerName, percentage: 100 }] }]
        };
        const deployer = createCloudflareStaticAssetsDeployer({
            fs, path, createClient: () => ({}), createAdapter: () => adapter, sleep: async () => {}
        });
        const result = await deployer.deploy({ id: 'www-bloggenius-kr', root_path: siteRoot }, {
            accessToken: 'token', account: { id: 'a'.repeat(32) }
        }, { environment: 'production', workerName: 'www-bloggenius-kr-production' });
        assert.equal(result.worker_name, 'www-bloggenius-kr-production');
        assert.equal(result.url, 'https://www-bloggenius-kr-production.example.workers.dev/');
        assert.deepEqual(calls, [['create', 'www-bloggenius-kr-production']]);
    } finally {
        fs.rmSync(siteRoot, { recursive: true, force: true });
    }
});

test('deploy reports missing Cloudflare permission clearly and stops before writes', async () => {
    const calls = [];
    const deployer = createCloudflareStaticAssetsDeployer({
        getCredentials: async () => ({ accessToken: 'oauth-token', account: { id: 'a'.repeat(32) } }),
        createClient: () => ({}),
        createAdapter: () => ({
            getWorkersSubdomain: async () => {
                calls.push('subdomain');
                const error = new Error('{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}');
                error.status = 403;
                throw error;
            },
            listWorkerScripts: async () => { calls.push('list'); return []; },
            createWorker: async () => { calls.push('create'); }
        })
    });

    await assert.rejects(
        deployer.deploy({ id: 'site-123', root_path: '/unused' }),
        (error) => {
            assert.equal(error.code, 'CLOUDFLARE_DEPLOY_PERMISSION_DENIED');
            assert.match(error.message, /Cloudflare 권한이 거부되었습니다: workers\.dev 주소 확인/);
            assert.doesNotMatch(error.message, /Authentication error|10000|oauth-token/);
            return true;
        }
    );
    assert.deepEqual(calls, ['subdomain']);
});
