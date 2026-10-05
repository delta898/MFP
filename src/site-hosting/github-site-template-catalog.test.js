'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DEFAULT_CATALOG_URL, DEVELOPMENT_CATALOG_URL, createGitHubSiteTemplateCatalog } = require('./github-site-template-catalog');

test('default Amade catalog points at the GitHub main branch', () => {
    assert.equal(DEFAULT_CATALOG_URL, 'https://raw.githubusercontent.com/delta898/Amade/main/amade/catalog/index.json');
});

test('development Amade catalog points at the grouped dev branch', () => {
    const catalog = createGitHubSiteTemplateCatalog({ cacheRoot: path.join(os.tmpdir(), 'amade-development-catalog-test'), environment: 'development' });
    assert.equal(catalog.catalogUrl, DEVELOPMENT_CATALOG_URL);
    assert.equal(DEVELOPMENT_CATALOG_URL, 'https://raw.githubusercontent.com/delta898/Amade/dev/amade/catalog/index.json');
});

test('development Amade catalog hides templates without active status', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amade-development-legacy-filter-'));
    try {
        const fixture = createFixture();
        const cacheRoot = path.join(workspaceDir, 'cache');
        const legacyCatalog = createGitHubSiteTemplateCatalog({
            cacheRoot,
            catalogUrl: fixture.catalogUrl,
            fetchImpl: fixture.fetchImpl
        });
        await legacyCatalog.list();
        await legacyCatalog.prepare('astro-homepage');

        const developmentCatalog = createGitHubSiteTemplateCatalog({
            cacheRoot,
            environment: 'development',
            catalogUrl: fixture.catalogUrl,
            fetchImpl: async (url) => String(url) === fixture.catalogUrl
                ? { ok: true, status: 200, arrayBuffer: async () => Buffer.from(JSON.stringify(fixture.catalog)) }
                : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }
        });
        assert.deepEqual(await developmentCatalog.list(), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
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

test('Amade 0.1 family catalog groups active templates and materializes Astro source beside family site data', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'github-site-family-template-'));
    try {
        const catalogUrl = 'https://raw.githubusercontent.com/delta898/Amade/test/amade/catalog/index.json';
        const revision = 'c'.repeat(40);
        const familyPath = 'amade/families/personal-homepage/family.json';
        const templatePath = 'amade/templates/personal-post-list/template.json';
        const sourceFiles = {
            'amade/templates/personal-post-list/preview.png': Buffer.from('png-preview'),
            'amade/templates/personal-post-list/astro/package.json': Buffer.from('{"scripts":{"build":"astro build"}}'),
            'amade/templates/personal-post-list/astro/package-lock.json': Buffer.from('{"lockfileVersion":3}'),
            'amade/templates/personal-post-list/astro/src/pages/index.astro': Buffer.from('<h1>home</h1>'),
            'amade/families/personal-homepage/data/site.json': Buffer.from(JSON.stringify({ displayName: '기본 이름', navigation: [{ id: 'posts', label: '글', path: '/blog/' }] })),
            'amade/families/personal-homepage/data/data/posts/hello/index.md': Buffer.from('---\nkind: post\n---')
        };
        const family = {
            spec_version: '0.1.0-dev2', family_id: 'personal-homepage', name: '개인 홈페이지',
            site_data_directory: 'data', content_types: [{ kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }]
        };
        const template = {
            spec_version: '0.1.0-dev2', template_id: 'personal-post-list', family_id: 'personal-homepage',
            name: '글 목록형', description: '기본 설명', author: 'amadejjs', version: '0.1.0', license: 'MIT',
            categories: ['Personal Website'], tags: ['List'], status: 'active', astro_project: 'astro', preview: 'preview.png',
            compatibility: { min_bloggenius_version: '0.6.0', contract: { id: 'bloggenius-site-hosting-template', version: '0.1.0-dev2' } },
            setup_inputs: [
                { id: 'knowledge_collection_root', type: 'directory', purpose: 'knowledge_collection', label: 'Obsidian Vault root', required: true },
                { id: 'publication_filter', type: 'frontmatter_match', purpose: 'publication_filter', label: '공개 노트 기준', required: true }
            ]
        };
        const catalogDocument = { spec_version: '0.1.0', status: 'experimental', families: [{
            family_id: 'personal-homepage', manifest: familyPath,
            templates: [{ template_id: 'personal-post-list', manifest: templatePath }]
        }] };
        const tree = Object.entries(sourceFiles).map(([filePath, bytes]) => ({ path: filePath, type: 'blob', mode: '100644', size: bytes.length }));
        const fetchImpl = async (url) => {
            const value = String(url);
            let bytes;
            if (value === catalogUrl || value === `https://raw.githubusercontent.com/delta898/Amade/${revision}/amade/catalog/index.json`) bytes = Buffer.from(JSON.stringify(catalogDocument));
            else if (value === `https://raw.githubusercontent.com/delta898/Amade/${revision}/${familyPath}`) bytes = Buffer.from(JSON.stringify(family));
            else if (value === `https://raw.githubusercontent.com/delta898/Amade/${revision}/${templatePath}`) bytes = Buffer.from(JSON.stringify(template));
            else if (value === `https://api.github.com/repos/delta898/Amade/git/trees/${revision}?recursive=1`) bytes = Buffer.from(JSON.stringify({ truncated: false, tree }));
            else {
                const prefix = `https://raw.githubusercontent.com/delta898/Amade/${revision}/`;
                bytes = value.startsWith(prefix) ? sourceFiles[value.slice(prefix.length)] : null;
            }
            return bytes ? { ok: true, status: 200, arrayBuffer: async () => bytes } : { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        };
        const catalog = createGitHubSiteTemplateCatalog({
            fs, path, cacheRoot: path.join(workspaceDir, 'cache'), catalogUrl, fetchImpl,
            bloggeniusVersion: '0.6.0',
            revisionResolver: async () => revision
        });
        const listed = await catalog.list();
        assert.equal(listed.length, 1);
        assert.equal(listed[0].family_id, 'personal-homepage');
        assert.equal(listed[0].family_name, '개인 홈페이지');
        assert.deepEqual(listed[0].tags, ['List']);
        assert.equal(catalog.get('personal-post-list').resource.template.setup_inputs[1].type, 'frontmatter_match');
        assert.equal(catalog.getPreview('personal-post-list').contentType, 'image/png');

        const olderBlogGenius = createGitHubSiteTemplateCatalog({
            fs, path, cacheRoot: path.join(workspaceDir, 'older-app-cache'), catalogUrl, fetchImpl,
            bloggeniusVersion: '0.5.5', revisionResolver: async () => revision
        });
        assert.deepEqual(await olderBlogGenius.list(), []);

        await catalog.prepare('personal-post-list');
        const destination = path.join(workspaceDir, 'site');
        assert.equal(catalog.copySource('personal-post-list', destination).version, '0.1.0');
        assert.equal(fs.existsSync(path.join(destination, 'template', 'astro', 'src', 'pages', 'index.astro')), true);
        assert.equal(fs.existsSync(path.join(destination, 'site-data', 'site.json')), true);
        assert.equal(fs.existsSync(path.join(destination, 'site-data', 'data', 'posts', 'hello', 'index.md')), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Amade 0.1 grouped catalog references use repository-root package paths', async () => {
    const catalogUrl = 'https://raw.githubusercontent.com/delta898/Amade/test/amade/catalog/index.json';
    const revision = 'd'.repeat(40);
    const catalog = createGitHubSiteTemplateCatalog({
        fs,
        path,
        cacheRoot: path.join(os.tmpdir(), `github-family-invalid-refs-${crypto.randomUUID()}`),
        catalogUrl,
        fetchImpl: async (url) => {
            if (String(url) === catalogUrl || String(url) === `https://raw.githubusercontent.com/delta898/Amade/${revision}/amade/catalog/index.json`) {
                return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(JSON.stringify({ spec_version: '0.1.0', status: 'experimental', families: [{ family_id: 'personal-homepage', manifest: 'families/personal-homepage/family.json', templates: [] }] })) };
            }
            return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
        },
        revisionResolver: async () => revision
    });
    await assert.rejects(catalog.list(), { code: 'SITE_HOSTING_TEMPLATE_CATALOG_INVALID' });
});
