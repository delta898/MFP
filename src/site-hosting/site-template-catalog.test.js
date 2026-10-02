'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteTemplateCatalog } = require('./site-template-catalog');

test('temporary homepage template is listed as metadata and copied from its Astro source folder', () => {
    const catalog = createSiteTemplateCatalog({ fs, path });
    const templates = catalog.list();
    assert.deepEqual(templates.map(({ id, version, name }) => ({ id, version, name })), [
        { id: 'minimal-homepage', version: '0.1.0', name: '간단한 홈페이지' }
    ]);
    assert.equal(catalog.get('minimal-homepage').source_root.endsWith(path.join('minimal-homepage', 'astro')), true);

    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'site-template-copy-'));
    try {
        assert.deepEqual(catalog.copySource('minimal-homepage', destination), { id: 'minimal-homepage', version: '0.1.0' });
        assert.equal(fs.existsSync(path.join(destination, 'package.json')), true);
        assert.equal(fs.existsSync(path.join(destination, 'astro.config.mjs')), true);
        assert.equal(fs.existsSync(path.join(destination, 'src', 'pages', 'index.astro')), true);
        assert.equal(fs.existsSync(path.join(destination, '.bloggenius')), false);
        const previewPath = path.join(destination, '.bloggenius', 'template-preview.svg');
        assert.equal(catalog.copyPreview('minimal-homepage', previewPath), previewPath);
        assert.equal(fs.readFileSync(previewPath, 'utf8').includes('새로운 사이트를 시작해 보세요.'), true);
    } finally {
        fs.rmSync(destination, { recursive: true, force: true });
    }
});

test('template catalog rejects path-like IDs and reports an unknown template', () => {
    const catalog = createSiteTemplateCatalog({ fs, path });
    assert.equal(catalog.get('../minimal-homepage'), null);
    assert.throws(() => catalog.copySource('missing-template', os.tmpdir()), { code: 'SITE_HOSTING_TEMPLATE_NOT_FOUND' });
});
