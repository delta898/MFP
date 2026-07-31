const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createRemoteModelCatalogService,
    extractCatalogPayload
} = require('./remote-model-catalog');

function createMemoryFs(initial = {}) {
    const files = new Map(Object.entries(initial));
    return {
        existsSync(filePath) {
            return files.has(filePath);
        },
        readFileSync(filePath) {
            return files.get(filePath);
        },
        mkdirSync() {},
        writeFileSync(filePath, value) {
            files.set(filePath, value);
        },
        renameSync(from, to) {
            files.set(to, files.get(from));
            files.delete(from);
        },
        files
    };
}

test('remote catalog refresh validates, applies, and atomically caches published payload', async () => {
    const memoryFs = createMemoryFs();
    const applied = [];
    const payload = {
        schema_version: 1,
        version: 'remote-1',
        models: []
    };
    const service = createRemoteModelCatalogService({
        config: {
            LICENSE_CHK_URL: 'https://example.supabase.co',
            LICENSE_CHK_KEY: 'anon',
            UPDATE_CHANNEL: 'stable',
            APP_ROOT_DIR: '/app'
        },
        appVersion: '0.1.14',
        cachePath: '/cache/catalog.json',
        fsImpl: memoryFs,
        logger: { debug() {} },
        createClientImpl() {
            return {
                async rpc(name, args) {
                    assert.equal(name, 'get_ai_model_catalog');
                    assert.equal(args.p_channel, 'stable');
                    return { data: { version: 'remote-1', payload }, error: null };
                }
            };
        },
        applyRemoteCatalogImpl(value) {
            applied.push(value);
            return {
                source: 'remote',
                version: value.version,
                schema_version: 1,
                remote_model_count: 0
            };
        },
        getCatalogStatusImpl() {
            return { source: applied.length ? 'remote' : 'bundled', version: applied.at(-1)?.version || 'bundled' };
        }
    });

    const result = await service.refresh(true);

    assert.equal(result.refreshed, true);
    assert.equal(applied.length, 1);
    assert.equal(JSON.parse(memoryFs.files.get('/cache/catalog.json')).version, 'remote-1');
    assert.equal(memoryFs.files.has('/cache/catalog.json.tmp'), false);
});

test('invalid cache or remote failure keeps the current fallback', async () => {
    const memoryFs = createMemoryFs({
        '/cache/catalog.json': '{broken'
    });
    const service = createRemoteModelCatalogService({
        config: {
            LICENSE_CHK_URL: 'https://example.supabase.co',
            LICENSE_CHK_KEY: 'anon',
            APP_ROOT_DIR: '/app'
        },
        cachePath: '/cache/catalog.json',
        fsImpl: memoryFs,
        logger: { debug() {} },
        createClientImpl() {
            return {
                async rpc() {
                    return { data: null, error: new Error('offline') };
                }
            };
        },
        getCatalogStatusImpl() {
            return { source: 'bundled', version: 'bundled' };
        }
    });

    const result = await service.refresh(true);
    assert.equal(result.refreshed, false);
    assert.equal(result.source, 'bundled');
    assert.match(result.error, /offline/);
});

test('Supabase wrapper response is normalized to catalog payload', () => {
    assert.deepEqual(extractCatalogPayload({
        version: 'v2',
        minimum_app_version: '0.2.0',
        payload: {
            schema_version: 1,
            models: []
        }
    }), {
        schema_version: 1,
        version: 'v2',
        minimum_app_version: '0.2.0',
        models: []
    });
});
