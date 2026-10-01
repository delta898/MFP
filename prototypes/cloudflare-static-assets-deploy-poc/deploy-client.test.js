const assert = require('node:assert/strict');
const test = require('node:test');

const { API_BASE_URL, createAssetManifest, createCloudflareStaticAssetsClient } = require('./deploy-client');

const ACCOUNT_ID = 'a'.repeat(32);
const SCRIPT_NAME = 'bloggenius-static-poc';

function response(result, status = 200, success = true) {
    const payload = { success, result, errors: success ? [] : [{ code: 10000, message: 'permission denied' }] };
    return {
        ok: status >= 200 && status < 300,
        status,
        async text() { return JSON.stringify(payload); }
    };
}

test('asset upload session registers a manifest using the OAuth bearer token', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ jwt: 'upload-session-jwt', buckets: [['hash-a']] });
        }
    });

    const result = await client.createAssetUploadSession({
        accountId: ACCOUNT_ID,
        scriptName: SCRIPT_NAME,
        manifest: { '/index.html': { hash: 'hash-a', size: 13 } }
    });

    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/assets-upload-session`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer oauth-access-token');
    assert.deepEqual(JSON.parse(request.options.body), { manifest: { '/index.html': { hash: 'hash-a', size: 13 } } });
    assert.deepEqual(result, { uploadToken: 'upload-session-jwt', buckets: [['hash-a']] });
});

test('sample assets produce Cloudflare path/hash/size manifest and reject unsafe paths', () => {
    const result = createAssetManifest([{ path: 'index.html', content: '<h1>PoC</h1>' }]);
    const [entry] = Object.entries(result.manifest);
    assert.equal(entry[0], '/index.html');
    assert.equal(entry[1].size, Buffer.byteLength('<h1>PoC</h1>'));
    assert.match(entry[1].hash, /^[a-f0-9]{32}$/);
    assert.equal(result.filesByHash.get(entry[1].hash).toString(), '<h1>PoC</h1>');
    assert.throws(() => createAssetManifest([{ path: '../outside.html', content: 'x' }]), /without dot segments/);
});

test('first deploy creates a Worker control-plane resource before uploading versions', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ id: 'worker-uuid', name: SCRIPT_NAME });
        }
    });

    const worker = await client.createWorker({ accountId: ACCOUNT_ID, name: SCRIPT_NAME });

    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/workers`);
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), { name: SCRIPT_NAME, subdomain: { enabled: true } });
    assert.equal(worker.id, 'worker-uuid');
});

test('Worker lookup uses the existing Worker name for an explicitly reviewed recovery path', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ id: 'worker-uuid', name: SCRIPT_NAME });
        }
    });

    const worker = await client.getWorker({ accountId: ACCOUNT_ID, name: SCRIPT_NAME });

    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/workers/${SCRIPT_NAME}`);
    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.headers.Authorization, 'Bearer oauth-access-token');
    assert.equal(worker.id, 'worker-uuid');
});

test('Worker lookup treats only an HTTP 404 as an absent Worker', async () => {
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async () => response({}, 404, false)
    });

    assert.equal(await client.getWorker({ accountId: ACCOUNT_ID, name: SCRIPT_NAME }), null);
});

test('asset bucket upload uses each asset hash as a multipart field name', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ jwt: 'completion-jwt' }, 201);
        }
    });

    const result = await client.uploadAssetBuckets({
        accountId: ACCOUNT_ID,
        buckets: [['hash-a', 'hash-b']],
        filesByHash: new Map([
            ['hash-a', Buffer.from('hello')],
            ['hash-b', Buffer.from('world')]
        ]),
        uploadToken: 'upload-session-jwt'
    });

    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/assets/upload?base64=true`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer upload-session-jwt');
    assert.equal(request.options.body.get('hash-a'), Buffer.from('hello').toString('base64'));
    assert.equal(request.options.body.get('hash-b'), Buffer.from('world').toString('base64'));
    assert.equal(request.options.body.get('body[hash-a]'), null);
    assert.equal(request.options.body.get('body'), null);
    assert.equal(result, 'completion-jwt');
});

test('asset upload success without a completion JWT reports only safe response diagnostics', async () => {
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async () => response({}, 200)
    });

    await assert.rejects(
        client.uploadAssetBuckets({
            accountId: ACCOUNT_ID,
            buckets: [['hash-a']],
            filesByHash: new Map([['hash-a', Buffer.from('hello')]]),
            uploadToken: 'short-lived-upload-token'
        }),
        (error) => error.message.includes('HTTP 200; result fields: none; message codes: none')
            && !error.message.includes('short-lived-upload-token')
    );
});

test('empty asset buckets reuse the session completion JWT without another request', async () => {
    let requestCount = 0;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async () => { requestCount += 1; return response({}); }
    });

    const result = await client.uploadAssetBuckets({ accountId: ACCOUNT_ID, buckets: [], uploadToken: 'already-complete-jwt' });
    assert.equal(result, 'already-complete-jwt');
    assert.equal(requestCount, 0);
});

test('stable version upload sends the completion token and static asset binding without deployment', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ id: 'version-uuid' });
        }
    });

    const version = await client.uploadWorkerVersion({
        accountId: ACCOUNT_ID,
        scriptName: SCRIPT_NAME,
        completionToken: 'completion-jwt',
        compatibilityDate: '2026-10-02'
    });

    const metadata = JSON.parse(request.options.body.get('metadata'));
    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/versions`);
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer oauth-access-token');
    assert.equal(metadata.assets.jwt, 'completion-jwt');
    assert.deepEqual(metadata.bindings, [{ name: 'ASSETS', type: 'assets' }]);
    assert.equal(request.options.body.get('worker.js').name, 'worker.js');
    assert.equal(version.id, 'version-uuid');
});

test('deployment explicitly sends 100 percent traffic to the uploaded version', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ id: 'deployment-uuid' });
        }
    });

    await client.createDeployment({ accountId: ACCOUNT_ID, scriptName: SCRIPT_NAME, versionId: 'version-uuid' });

    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/scripts/${SCRIPT_NAME}/deployments`);
    assert.equal(request.options.method, 'POST');
    assert.deepEqual(JSON.parse(request.options.body), {
        strategy: 'percentage',
        versions: [{ percentage: 100, version_id: 'version-uuid' }]
    });
});

test('deployment lookup reads active deployment from the first API result', async () => {
    let request;
    const deployments = [{ id: 'latest', versions: [{ version_id: 'version-uuid', percentage: 100 }] }];
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ deployments });
        }
    });

    const result = await client.listDeployments({ accountId: ACCOUNT_ID, scriptName: SCRIPT_NAME });

    assert.equal(request.options.method, 'GET');
    assert.equal(request.options.headers.Authorization, 'Bearer oauth-access-token');
    assert.deepEqual(result, deployments);
});

test('account workers.dev subdomain is read before preparing a live URL', async () => {
    let request;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async (url, options) => {
            request = { url, options };
            return response({ subdomain: 'example-account' });
        }
    });

    const result = await client.getWorkersSubdomain({ accountId: ACCOUNT_ID });
    assert.equal(request.url, `${API_BASE_URL}/accounts/${ACCOUNT_ID}/workers/subdomain`);
    assert.equal(request.options.method, 'GET');
    assert.equal(result, 'example-account');
});

test('validation and provider failures do not include bearer tokens in errors', async () => {
    let requestCount = 0;
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'sensitive-token',
        fetchImpl: async () => { requestCount += 1; return response({}, 403, false); }
    });

    await assert.rejects(
        client.createAssetUploadSession({ accountId: 'invalid', scriptName: SCRIPT_NAME, manifest: { '/index.html': { hash: 'a', size: 1 } } }),
        /32 hexadecimal characters/
    );
    await assert.rejects(
        client.listDeployments({ accountId: ACCOUNT_ID, scriptName: SCRIPT_NAME }),
        (error) => error.message.includes('permission denied') && !error.message.includes('sensitive-token')
    );
    assert.equal(requestCount, 1);
});

test('asset upload errors do not echo the short-lived upload JWT', async () => {
    const client = createCloudflareStaticAssetsClient({
        accessToken: 'oauth-access-token',
        fetchImpl: async () => ({
            ok: false,
            status: 403,
            async text() { return JSON.stringify({ success: false, errors: [{ code: 10000, message: 'short-lived-upload-jwt was rejected' }] }); }
        })
    });

    await assert.rejects(
        client.uploadAssetBuckets({
            accountId: ACCOUNT_ID,
            buckets: [['hash-a']],
            filesByHash: new Map([['hash-a', Buffer.from('hello')]]),
            uploadToken: 'short-lived-upload-jwt'
        }),
        (error) => error.message.includes('HTTP 403') && !error.message.includes('short-lived-upload-jwt')
    );
});
