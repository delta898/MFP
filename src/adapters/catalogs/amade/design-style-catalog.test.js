'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DESIGN_STYLE_REQUIRED_TOKENS, DESIGN_STYLE_CONTRACT_VERSION } = require('../../../../ui/scripts/foundation/design-style-token-contract');
const { DEFAULT_CATALOG_URL, PRODUCTION_CATALOG_URL, DEVELOPMENT_CATALOG_URL, createGitHubDesignStyleCatalog } = require('./design-style-catalog');

const REVISION = 'a'.repeat(40);

function validStyle(id = 'warm-editorial', tokens = null) {
    return {
        spec_version: '0.1.0', style_id: id, name: 'Warm Editorial', description: 'A warm paper-like appearance.',
        author: 'Amade', version: '0.1.0', license: 'MIT', created_at: '2026-10-04',
        categories: ['BlogGenius UI'], tags: ['appearance'], preview: 'preview.svg', status: 'active',
        compatibility: {
            min_bloggenius_version: '0.6.0',
            contract: { id: 'bloggenius-ui-style-tokens', version: DESIGN_STYLE_CONTRACT_VERSION }
        },
        tokens: tokens || Object.fromEntries(DESIGN_STYLE_REQUIRED_TOKENS.map((name) => [name, '#123456']))
    };
}

function response(value) {
    return { ok: true, arrayBuffer: async () => Buffer.from(JSON.stringify(value)) };
}

test('Amade styles use environment catalogs and isolated caches', async () => {
    assert.equal(DEFAULT_CATALOG_URL, PRODUCTION_CATALOG_URL);
    assert.equal(PRODUCTION_CATALOG_URL, 'https://raw.githubusercontent.com/delta898/Amade/main/amade/catalog/production-index.json');
    assert.equal(DEVELOPMENT_CATALOG_URL, 'https://raw.githubusercontent.com/delta898/Amade/dev/amade/catalog/index.json');
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amade-style-env-cache-'));
    try {
        const developmentCatalog = {
            spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-official', families: [],
            styles: [{ style_id: 'remote-test-style', manifest: 'amade/styles/remote-test-style/style.json' }]
        };
        const productionCatalog = {
            spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-production', families: [],
            styles: [{ style_id: 'warm-editorial', manifest: 'amade/styles/warm-editorial/style.json' }]
        };
        const calls = [];
        const refs = [];
        const fetchImpl = async (url) => {
            calls.push(String(url));
            if (String(url).endsWith('/amade/catalog/production-index.json')) return response(productionCatalog);
            if (String(url).endsWith('/amade/catalog/index.json')) return response(developmentCatalog);
            if (String(url).endsWith('/amade/styles/remote-test-style/style.json')) return response(validStyle('remote-test-style'));
            return response(validStyle('warm-editorial'));
        };
        const options = { workspaceDir, bloggeniusVersion: '0.6.0', revisionResolver: async ({ ref }) => { refs.push(ref); return REVISION; }, fetchImpl };
        const development = createGitHubDesignStyleCatalog({ ...options, environment: 'development' });
        const production = createGitHubDesignStyleCatalog({ ...options, environment: 'production' });
        assert.deepEqual((await development.list()).styles.map((style) => style.id), ['remote-test-style']);
        const productionOffline = createGitHubDesignStyleCatalog({
            ...options,
            environment: 'production',
            revisionResolver: async () => REVISION,
            fetchImpl: async () => { throw new Error('offline'); }
        });
        await assert.rejects(productionOffline.list(), { code: 'BLOGGENIUS_UI_STYLE_CATALOG_UNAVAILABLE' });
        assert.deepEqual((await production.list()).styles.map((style) => style.id), ['warm-editorial']);
        assert.deepEqual(refs, ['dev', 'main']);
        assert.ok(calls.some((url) => url.endsWith('/amade/catalog/index.json')));
        assert.ok(calls.some((url) => url.endsWith('/amade/catalog/production-index.json')));
        assert.ok(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'design-style-cache-development.json')));
        assert.ok(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'design-style-cache-production.json')));
    } finally { fs.rmSync(workspaceDir, { recursive: true, force: true }); }
});

test('Amade style catalog lists active, revision-pinned styles and uses verified cache on fetch failure', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amade-style-catalog-'));
    try {
        const catalog = {
            spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-official', families: [],
            styles: [
                { style_id: 'warm-editorial', manifest: 'amade/styles/warm-editorial/style.json' },
                { style_id: 'retired-style', manifest: 'amade/styles/retired-style/style.json' }
            ]
        };
        const manifestByPath = {
            'amade/styles/warm-editorial/style.json': validStyle(),
            'amade/styles/retired-style/style.json': { ...validStyle('retired-style'), status: 'deprecated', tokens: {} }
        };
        const calls = [];
        const service = createGitHubDesignStyleCatalog({
            workspaceDir,
            environment: 'development',
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => REVISION,
            fetchImpl: async (url) => {
                calls.push(url);
                const filePath = url.slice(url.indexOf(`/${REVISION}/`) + REVISION.length + 2);
                if (filePath === 'amade/catalog/index.json') return response(catalog);
                return response(manifestByPath[filePath]);
            }
        });
        const first = await service.list();
        assert.equal(first.source, 'amade');
        assert.equal(first.revision, REVISION);
        assert.deepEqual(first.styles.map((style) => style.id), ['warm-editorial']);
        assert.equal(first.styles[0].tokens['--ui-canvas'], '#123456');
        assert.equal(calls.length, 3);

        const offline = createGitHubDesignStyleCatalog({
            workspaceDir,
            environment: 'development',
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => REVISION,
            fetchImpl: async () => { throw new Error('offline'); }
        });
        const cached = await offline.list();
        assert.equal(cached.source, 'cache');
        assert.deepEqual(cached.styles.map((style) => style.id), ['warm-editorial']);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Amade style catalog rejects unsafe token values and does not cache the package', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amade-style-invalid-'));
    try {
        const unsafeTokens = Object.fromEntries(DESIGN_STYLE_REQUIRED_TOKENS.map((name) => [name, '#123456']));
        unsafeTokens['--ui-canvas'] = 'url(https://example.com/pixel.png)';
        const service = createGitHubDesignStyleCatalog({
            workspaceDir,
            environment: 'development',
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => REVISION,
            fetchImpl: async (url) => {
                if (url.endsWith('/amade/catalog/index.json')) return response({
                    spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-official', families: [],
                    styles: [{ style_id: 'warm-editorial', manifest: 'amade/styles/warm-editorial/style.json' }]
                });
                return response(validStyle('warm-editorial', unsafeTokens));
            }
        });
        await assert.rejects(service.list(), { code: 'BLOGGENIUS_UI_STYLE_INVALID' });
        assert.equal(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'design-style-cache-development.json')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Amade valid catalog with no active styles clears selectable cache instead of resurrecting it', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amade-style-empty-authoritative-'));
    try {
        const catalog = {
            spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-official', families: [],
            styles: [{ style_id: 'warm-editorial', manifest: 'amade/styles/warm-editorial/style.json' }]
        };
        let manifest = validStyle();
        const service = createGitHubDesignStyleCatalog({
            workspaceDir,
            environment: 'development',
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => REVISION,
            fetchImpl: async (url) => url.endsWith('/amade/catalog/index.json') ? response(catalog) : response(manifest)
        });
        assert.equal((await service.list()).styles.length, 1);
        manifest = { ...validStyle(), status: 'withdrawn' };
        const empty = await service.list();
        assert.equal(empty.source, 'amade');
        assert.deepEqual(empty.styles, []);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspaceDir, 'site-hosting', 'design-style-cache-development.json'), 'utf8')).styles, []);

        const offline = createGitHubDesignStyleCatalog({
            workspaceDir,
            environment: 'development',
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => REVISION,
            fetchImpl: async () => { throw new Error('offline'); }
        });
        await assert.rejects(offline.list(), { code: 'BLOGGENIUS_UI_STYLE_CATALOG_UNAVAILABLE' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Amade style catalog skips packages requiring a newer app without hiding compatible styles', async () => {
    const catalog = {
        spec_version: '0.1.0', status: 'experimental', catalog_id: 'amade-official', families: [],
        styles: [
            { style_id: 'warm-editorial', manifest: 'amade/styles/warm-editorial/style.json' },
            { style_id: 'future-style', manifest: 'amade/styles/future-style/style.json' }
        ]
    };
    const future = validStyle('future-style');
    future.compatibility.min_bloggenius_version = '0.7.0';
    const service = createGitHubDesignStyleCatalog({
        environment: 'development',
        bloggeniusVersion: '0.6.0',
        revisionResolver: async () => REVISION,
        fetchImpl: async (url) => {
            if (url.endsWith('/amade/catalog/index.json')) return response(catalog);
            if (url.endsWith('/amade/styles/warm-editorial/style.json')) return response(validStyle());
            return response(future);
        }
    });
    const result = await service.list();
    assert.deepEqual(result.styles.map((style) => style.id), ['warm-editorial']);
});
