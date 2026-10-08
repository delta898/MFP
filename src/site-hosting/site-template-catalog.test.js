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

test('metadata-only template cache remains readable but cannot be copied as a new site', () => {
    const templatesRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'site-template-metadata-'));
    try {
        const templateRoot = path.join(templatesRoot, 'digital-garden-explorer-left');
        fs.mkdirSync(templateRoot, { recursive: true });
        fs.writeFileSync(path.join(templateRoot, 'template.json'), `${JSON.stringify({
            id: 'digital-garden-explorer-left', version: '0.1.3', name: '디지털 가든',
            source_directory: 'package/0.1.3/astro', family_data_directory: 'package/0.1.3/site-data',
            family_id: 'digital-garden', package_ready: false,
            resource: { spec_version: '0.1.0-dev4', family: { content_types: [] } }
        })}\n`);

        const catalog = createSiteTemplateCatalog({ fs, path, templatesRoot });
        const cached = catalog.get('digital-garden-explorer-left');
        assert.equal(cached.package_ready, false);
        assert.equal(cached.family_id, 'digital-garden');
        assert.equal(cached.resource.spec_version, '0.1.0-dev4');
        assert.throws(() => catalog.copySource(cached.id, os.tmpdir()), { code: 'SITE_HOSTING_TEMPLATE_NOT_FOUND' });
    } finally {
        fs.rmSync(templatesRoot, { recursive: true, force: true });
    }
});
