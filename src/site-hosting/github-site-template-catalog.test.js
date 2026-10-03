'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DEFAULT_CATALOG_URL, createGitHubSiteTemplateCatalog } = require('./github-site-template-catalog');

test('default Amade catalog points at the GitHub main branch', () => {
    assert.equal(DEFAULT_CATALOG_URL, 'https://raw.githubusercontent.com/delta898/Amade/main/amade/catalog/index.json');
});

function createFixture(revision = 'a'.repeat(40)) {
    const files = {
        'amade/templates/site-hosting/astro-homepage/1.0.0/astro/package.json': Buffer.from('{"name":"fixture","scripts":{"build":"astro build"}}\n'),
        'amade/templates/site-hosting/astro-homepage/1.0.0/astro/src/site-config.json': Buffer.from('{"name":"Template","logo":"","navigation":[]}\n'),
        'amade/templates/site-hosting/astro-homepage/1.0.0/preview.svg': Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>preview</text></svg>')
    };
    const hashed = (file) => ({ path: file.replace('amade/templates/site-hosting/astro-homepage/1.0.0/', ''), sha256: crypto.createHash('sha256').update(files[file]).digest('hex') });
    const resource = {
        schema_version: 1,
        id: 'astro-homepage',
        kind: 'site-hosting',
        version: '1.0.0',
        name: 'Astro Homepage',
        description: 'Fixture template',
        preview: { ...hashed('amade/templates/site-hosting/astro-homepage/1.0.0/preview.svg'), media_type: 'image/svg+xml' },
        package: { path: '.', files: [hashed('amade/templates/site-hosting/astro-homepage/1.0.0/astro/package.json'), hashed('amade/templates/site-hosting/astro-homepage/1.0.0/astro/src/site-config.json')] },
        site_hosting: {
            schema_version: 1,
            astro: { source: 'astro', build_command: 'npm run build', output_directory: 'dist' },
            customization: { schema_version: 1, fields: [] },
            publishing: { content_directory: 'src/content/posts', route_pattern: '/blog/{slug}/', frontmatter: ['title', 'pubDate'] }
        }
    };
    const manifestPath = 'amade/templates/site-hosting/astro-homepage/1.0.0/resource.json';
    const catalog = { schema_version: 1, resources: [{ kind: 'site-hosting', id: resource.id, version: resource.version, revision, manifest: manifestPath }] };
    files[manifestPath] = Buffer.from(JSON.stringify(resource));
    const catalogUrl = 'https://raw.githubusercontent.com/delta898/Amade/test/amade/catalog/index.json';
    const requests = [];
    const fetchImpl = async (url) => {
        requests.push(url);
        const key = String(url).replace(`https://raw.githubusercontent.com/delta898/Amade/${revision}/`, '');
        const bytes = String(url) === catalogUrl ? Buffer.from(JSON.stringify(catalog)) : files[key];
        if (!bytes) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        return { ok: true, status: 200, arrayBuffer: async () => bytes };
    };
    return { catalogUrl, fetchImpl, requests, revision, catalog };
}

test('GitHub catalog verifies pinned package files and safely materializes a template', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-site-template-catalog-'));
    try {
        const fixture = createFixture();
        const catalog = createGitHubSiteTemplateCatalog({ fs, path, cacheRoot: path.join(workspaceDir, 'cache'), catalogUrl: fixture.catalogUrl, fetchImpl: fixture.fetchImpl });
        const entries = await catalog.list();
        assert.equal(entries.length, 1);
        assert.equal(entries[0].id, 'astro-homepage');
        assert.equal(entries[0].preview_url, '/api/v1/site-hosting/templates/astro-homepage/preview');
        assert.equal(catalog.getPreview('astro-homepage').contentType, 'image/svg+xml');

        await catalog.prepare('astro-homepage');
        const destination = path.join(workspaceDir, 'site');
        assert.deepEqual(catalog.copySource('astro-homepage', destination), { id: 'astro-homepage', version: '1.0.0', source_revision: fixture.revision });
        assert.equal(fs.existsSync(path.join(destination, 'package.json')), true);
        assert.equal(fs.readFileSync(path.join(destination, 'src', 'site-config.json'), 'utf8').includes('Template'), true);
        assert.equal(catalog.get('astro-homepage').package_ready, true);
        assert.equal(fixture.requests.every((url) => !String(url).includes('/main/')), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('GitHub catalog falls back to a cached template when the catalog is unavailable', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-site-template-fallback-'));
    try {
        const fixture = createFixture();
        const catalog = createGitHubSiteTemplateCatalog({ fs, path, cacheRoot: path.join(workspaceDir, 'cache'), catalogUrl: fixture.catalogUrl, fetchImpl: fixture.fetchImpl });
        await catalog.list();
        await catalog.prepare('astro-homepage');
        const staleCatalog = createGitHubSiteTemplateCatalog({
            fs,
            path,
            cacheRoot: path.join(workspaceDir, 'cache'),
            catalogUrl: fixture.catalogUrl,
            fetchImpl: async () => ({ ok: false, status: 503, arrayBuffer: async () => new ArrayBuffer(0) })
        });
        const cached = await staleCatalog.list();
        assert.equal(cached[0].id, 'astro-homepage');
        assert.equal(cached[0].catalog_status, 'cached');
        assert.equal(staleCatalog.stale, true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('GitHub catalog rejects a bad package checksum without replacing prior cache', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-site-template-checksum-'));
    try {
        const fixture = createFixture();
        const cacheRoot = path.join(workspaceDir, 'cache');
        const catalog = createGitHubSiteTemplateCatalog({ fs, path, cacheRoot, catalogUrl: fixture.catalogUrl, fetchImpl: fixture.fetchImpl });
        await catalog.list();
        await catalog.prepare('astro-homepage');
        const before = fs.readFileSync(path.join(cacheRoot, 'astro-homepage', 'package', '1.0.0', 'astro', 'package.json'), 'utf8');
        const broken = createFixture('b'.repeat(40));
        broken.fetchImpl = async (url) => {
            if (String(url).endsWith('/astro/package.json')) {
                return { ok: true, status: 200, arrayBuffer: async () => Buffer.from('tampered') };
            }
            if (String(url) === broken.catalogUrl) return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(JSON.stringify(broken.catalog)) };
            return fixture.fetchImpl(String(url).replace(`/${broken.revision}/`, `/${fixture.revision}/`));
        };
        const replacement = createGitHubSiteTemplateCatalog({ fs, path, cacheRoot, catalogUrl: broken.catalogUrl, fetchImpl: broken.fetchImpl });
        await replacement.list();
        await assert.rejects(replacement.prepare('astro-homepage'), { code: 'SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH' });
        assert.equal(fs.readFileSync(path.join(cacheRoot, 'astro-homepage', 'package', '1.0.0', 'astro', 'package.json'), 'utf8'), before);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
