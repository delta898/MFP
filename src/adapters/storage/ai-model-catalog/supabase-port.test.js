'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseModelCatalogPort, extractCatalogPayload } = require('./supabase-port');

function createMemoryFs(initial = {}) {
    const files = new Map(Object.entries(initial));
    return {
        existsSync: (filePath) => files.has(filePath),
        readFileSync: (filePath) => files.get(filePath),
        mkdirSync() {},
        writeFileSync(filePath, value) { files.set(filePath, value); },
        renameSync(from, to) { files.set(to, files.get(from)); files.delete(from); },
        files
    };
}

test('Supabase catalog port fetches the published RPC payload and manages only cache I/O', async () => {
    const memoryFs = createMemoryFs();
    const logs = [];
    const port = createSupabaseModelCatalogPort({
        config: {
            LICENSE_CHK_URL: 'https://example.supabase.co',
            LICENSE_CHK_KEY: 'publishable',
            UPDATE_CHANNEL: 'dev',
            RUNTIME_ENVIRONMENT: 'production',
            APP_ROOT_DIR: '/app'
        },
        appVersion: '0.6.1',
        logger: {
            info(message) { logs.push(message); },
            warn(message) { logs.push(message); }
        },
        cachePath: '/cache/catalog.json',
        fsImpl: memoryFs,
        createClientImpl() {
            return { async rpc(name, args) {
                assert.equal(name, 'get_ai_model_catalog');
                assert.equal(args.p_channel, 'production');
                assert.equal(args.p_app_version, '0.6.1');
                return { data: { version: 'remote-1', minimum_app_version: '0.6.1', payload: { schema_version: 1, models: [
                    { provider: 'kie', kind: 'text', status: 'active' },
                    { provider: 'kie', kind: 'image', status: 'active' },
                    { provider: 'google', kind: 'text', status: 'hidden' }
                ] } }, error: null };
            } };
        }
    });

    const payload = await port.fetchCatalog();
    assert.equal(payload.version, 'remote-1');
    assert.match(logs[0], /요청 시작 \(channel=production, appVersion=0\.6\.1\)/);
    assert.match(logs[1], /version=remote-1, minimumAppVersion=0\.6\.1, models=3, selectableText=1, selectableImage=1, kieText=1, kieImage=1/);
    port.saveCachedCatalog(payload);
    assert.deepEqual(port.loadCachedCatalog(), payload);
    assert.equal(memoryFs.files.has('/cache/catalog.json.tmp'), false);
});

test('Supabase catalog port logs RPC failures without exposing connection credentials', async () => {
    const logs = [];
    const port = createSupabaseModelCatalogPort({
        config: { LICENSE_CHK_URL: 'https://example.supabase.co', LICENSE_CHK_KEY: 'never-log-this', RUNTIME_ENVIRONMENT: 'development', UPDATE_CHANNEL: 'stable' },
        appVersion: '0.7.0-dev1',
        logger: {
            info(message) { logs.push(message); },
            warn(message) { logs.push(message); }
        },
        createClientImpl() {
            return { async rpc() { return { data: null, error: { code: 'RPC_ERROR', message: 'catalog unavailable' } }; } };
        }
    });
    await assert.rejects(port.fetchCatalog(), (error) => error.code === 'RPC_ERROR' && error.message === 'catalog unavailable');
    assert.match(logs[0], /channel=development, appVersion=0\.7\.0-dev1/);
    assert.match(logs[1], /code=RPC_ERROR, message=catalog unavailable/);
    assert.equal(logs.join('\n').includes('never-log-this'), false);
});

test('Supabase wrapper response is normalized to catalog payload', () => {
    assert.deepEqual(extractCatalogPayload({
        version: 'v2', minimum_app_version: '0.2.0',
        payload: { schema_version: 1, models: [] }
    }), {
        schema_version: 1, version: 'v2', minimum_app_version: '0.2.0', models: []
    });
    assert.equal(extractCatalogPayload(null), null);
});
