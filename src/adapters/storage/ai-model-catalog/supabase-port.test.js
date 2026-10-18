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
    const port = createSupabaseModelCatalogPort({
        config: {
            LICENSE_CHK_URL: 'https://example.supabase.co',
            LICENSE_CHK_KEY: 'publishable',
            UPDATE_CHANNEL: 'stable',
            APP_ROOT_DIR: '/app'
        },
        appVersion: '0.6.1',
        cachePath: '/cache/catalog.json',
        fsImpl: memoryFs,
        createClientImpl() {
            return { async rpc(name, args) {
                assert.equal(name, 'get_ai_model_catalog');
                assert.equal(args.p_channel, 'stable');
                assert.equal(args.p_app_version, '0.6.1');
                return { data: { version: 'remote-1', payload: { schema_version: 1, models: [] } }, error: null };
            } };
        }
    });

    const payload = await port.fetchCatalog();
    assert.equal(payload.version, 'remote-1');
    port.saveCachedCatalog(payload);
    assert.deepEqual(port.loadCachedCatalog(), payload);
    assert.equal(memoryFs.files.has('/cache/catalog.json.tmp'), false);
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
