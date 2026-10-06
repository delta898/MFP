'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('./project-repository');
const { createSiteHostingSiteRepository } = require('./site-repository');
const { createSiteTemplateCatalog } = require('./site-template-catalog');
const { createAstroSiteRuntime } = require('./astro-site-runtime');

function createFixture() {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-astro-runtime-'));
    const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
    const templates = createSiteTemplateCatalog({ fs, path });
    projectRepository.create({ id: 'project-1', name: 'Test Project' });
    const siteRepository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
    const site = siteRepository.create('project-1', {
        id: 'site-1', name: 'Test Site', template_id: 'minimal-homepage',
        created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z'
    });
    return { workspaceDir, projectRepository, siteRepository, templates, site };
}

function fakeNpmSpawn(calls) {
    return (_executable, args, options) => {
        calls.push({ args, options });
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => true;
        process.nextTick(() => {
            if (args.includes('build')) {
                fs.mkdirSync(path.join(options.cwd, 'dist'), { recursive: true });
                fs.writeFileSync(path.join(options.cwd, 'dist', 'index.html'), '<h1>Built site</h1>');
            }
            child.stdout.end('ok\n');
            child.emit('close', 0, null);
        });
        return child;
    };
}

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, { headers: { Connection: 'close' } }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => resolve({ status: response.statusCode, body, headers: response.headers }));
        }).on('error', reject);
    });
}

test('Astro runtime installs locked site dependencies, builds, and serves dist on loopback', async () => {
    const fixture = createFixture();
    try {
        process.env.BG_RUNTIME_TEST_SECRET = 'must-not-leak';
        const calls = [];
        let screenshotCount = 0;
        const metadataRoot = path.join(fixture.site.root_path, '.bloggenius');
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn(calls),
            captureScreenshot: async () => ({ buffer: Buffer.from(`fake-jpeg-${++screenshotCount}`), viewport: { width: 1200, height: 675 } })
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        assert.equal(Boolean(result.screenshot?.path), true);
        const metadata = fixture.siteRepository.get('project-1', 'site-1');
        assert.equal(metadata.screenshot.template.path, '.bloggenius/template-preview.svg');
        assert.equal(metadata.screenshot.latest_build.path, '.bloggenius/build-preview.jpg');
        assert.equal(fs.existsSync(path.join(fixture.site.root_path, metadata.screenshot.latest_build.path)), true);
        assert.equal(fs.readFileSync(path.join(fixture.site.root_path, metadata.screenshot.template.path), 'utf8').includes('새로운 사이트를 시작해 보세요.'), true);
        assert.equal(metadata.last_build.status, 'succeeded');
        assert.deepEqual(calls.map(({ args }) => args.slice(1)), [['ci', '--no-audit', '--no-fund'], ['run', 'build']]);
        assert.equal(calls[0].options.env.BG_RUNTIME_TEST_SECRET, undefined);
        const runtimeBin = calls[0].options.env.PATH.split(path.delimiter)[0];
        assert.equal(fs.existsSync(path.join(runtimeBin, process.platform === 'win32' ? 'node.cmd' : 'node')), true);
        assert.equal(calls[0].options.env.BLOGGENIUS_NODE_EXECUTABLE, process.execPath);
        assert.equal(runtime.getBuildStatus('project-1', 'site-1').status, 'succeeded');

        const preview = await runtime.startPreview('project-1', 'site-1');
        assert.deepEqual(calls.slice(2).map(({ args }) => args.slice(1)), [['ci', '--no-audit', '--no-fund'], ['run', 'build']]);
        assert.equal(preview.screenshot?.path, '.bloggenius/build-preview.jpg');
        assert.equal(preview.screenshot_error, '');
        try {
            assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
            const page = await get(preview.url);
            assert.equal(page.status, 200);
            assert.match(page.headers['content-type'], /text\/html/);
            assert.equal(page.body, '<h1>Built site</h1>');
            const afterSecondBuild = fixture.siteRepository.get('project-1', 'site-1');
            assert.equal(afterSecondBuild.screenshot.latest_build.path, metadata.screenshot.latest_build.path);
            assert.equal(afterSecondBuild.screenshot.builds, undefined);
            assert.equal(fs.readFileSync(path.join(metadataRoot, 'build-preview.jpg'), 'utf8'), 'fake-jpeg-2');
            assert.equal(fs.readdirSync(metadataRoot).filter((file) => /^build-[a-zA-Z0-9_-]+\.jpg$/.test(file)).length, 1);
            assert.equal(afterSecondBuild.screenshot.template.path, '.bloggenius/template-preview.svg');
            const traversal = await get(`${preview.url}..%2f..%2f..%2fpackage.json`);
            assert.equal(traversal.status, 403);
        } finally {
            await runtime.stopPreview('project-1', 'site-1');
        }
    } finally {
        delete process.env.BG_RUNTIME_TEST_SECRET;
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro runtime builds family templates from template/astro and keeps dist at the Site root', async () => {
    const fixture = createFixture();
    try {
        const nestedRoot = path.join(fixture.site.root_path, 'template', 'astro');
        fs.mkdirSync(nestedRoot, { recursive: true });
        fs.writeFileSync(path.join(nestedRoot, 'package.json'), '{"scripts":{"build":"astro build"}}');
        fs.writeFileSync(path.join(nestedRoot, 'package-lock.json'), '{"lockfileVersion":3}');
        const manifestPath = path.join(fixture.site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.template.family_id = 'personal-homepage';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        const calls = [];
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn(calls),
            captureScreenshot: async () => ({ buffer: Buffer.from('family-preview'), viewport: { width: 1200, height: 675 } })
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        assert.equal(calls.every((call) => call.options.cwd === nestedRoot), true);
        assert.equal(fs.readFileSync(path.join(fixture.site.root_path, 'dist', 'index.html'), 'utf8'), '<h1>Built site</h1>');
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro build remains successful and preserves the template image when capture fails', async () => {
    const fixture = createFixture();
    try {
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn([]),
            captureScreenshot: async () => { throw new Error('capture unavailable'); }
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        assert.match(result.message, /빌드를 마쳤지만/);
        assert.equal(fixture.siteRepository.get('project-1', 'site-1').screenshot.latest_build, null);
        assert.equal(fixture.siteRepository.getScreenshot('project-1', 'site-1').contentType, 'image/svg+xml');
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro build moves the publishing listing to the selected menu route and rewrites detail links', async () => {
    const fixture = createFixture();
    try {
        const manifestPath = path.join(fixture.site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.customization = {
            navigation: [{ label: '이야기', href: '/stories/series/' }],
            publishing: { listing_route: '/stories/series/', detail_route: '/stories/series/{slug}/', post_list_navigation_index: 0 }
        };
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const templates = {
            ...fixture.templates,
            get: (id) => ({
                ...fixture.templates.get(id),
                resource: { site_hosting: { publishing: { routes: { listing: '/blog/', detail: '/blog/{slug}/' } } } }
            })
        };
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: (_executable, args, options) => {
                const child = new EventEmitter();
                child.stdout = new PassThrough();
                child.stderr = new PassThrough();
                child.kill = () => true;
                process.nextTick(() => {
                    if (args.includes('build')) {
                        const dist = path.join(options.cwd, 'dist');
                        fs.mkdirSync(path.join(dist, 'blog', 'welcome'), { recursive: true });
                        fs.writeFileSync(path.join(dist, 'index.html'), '<h1>Home</h1>');
                        fs.writeFileSync(path.join(dist, 'blog', 'index.html'), '<a href="/blog/welcome/">Post</a>');
                        fs.writeFileSync(path.join(dist, 'blog', 'welcome', 'index.html'), '<a href="/blog/">Back</a>');
                    }
                    child.stdout.end('ok\n');
                    child.emit('close', 0, null);
                });
                return child;
            },
            captureScreenshot: async () => ({ buffer: Buffer.from('fake-jpeg'), viewport: { width: 1200, height: 675 } })
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        const dist = path.join(fixture.site.root_path, 'dist');
        assert.equal(fs.existsSync(path.join(dist, 'blog')), false);
        assert.equal(fs.readFileSync(path.join(dist, 'stories', 'series', 'index.html'), 'utf8'), '<a href="/stories/series/welcome/">Post</a>');
        assert.equal(fs.readFileSync(path.join(dist, 'stories', 'series', 'welcome', 'index.html'), 'utf8'), '<a href="/stories/series/">Back</a>');
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro build preserves an existing site-builder route and still succeeds', async () => {
    const fixture = createFixture();
    try {
        const manifestPath = path.join(fixture.site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.customization = {
            navigation: [{ label: '이야기', href: '/stories/series/' }],
            publishing: { listing_route: '/stories/series/', detail_route: '/stories/series/{slug}/', post_list_navigation_index: 0 }
        };
        fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
        const templates = {
            ...fixture.templates,
            get: (id) => ({
                ...fixture.templates.get(id),
                resource: { site_hosting: { publishing: { routes: { listing: '/blog/', detail: '/blog/{slug}/' } } } }
            })
        };
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: (_executable, args, options) => {
                const child = new EventEmitter();
                child.stdout = new PassThrough();
                child.stderr = new PassThrough();
                child.kill = () => true;
                process.nextTick(() => {
                    if (args.includes('build')) {
                        const dist = path.join(options.cwd, 'dist');
                        fs.mkdirSync(path.join(dist, 'blog'), { recursive: true });
                        fs.mkdirSync(path.join(dist, 'stories', 'series'), { recursive: true });
                        fs.writeFileSync(path.join(dist, 'index.html'), '<h1>Home</h1>');
                        fs.writeFileSync(path.join(dist, 'blog', 'index.html'), '<h1>Posts</h1>');
                        fs.writeFileSync(path.join(dist, 'stories', 'series', 'index.html'), '<h1>Custom builder output</h1>');
                        fs.writeFileSync(path.join(dist, 'stories', 'series', 'asset.js'), 'keep me');
                    }
                    child.stdout.end('ok\n');
                    child.emit('close', 0, null);
                });
                return child;
            }
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        const dist = path.join(fixture.site.root_path, 'dist');
        assert.equal(fs.readFileSync(path.join(dist, 'stories', 'series', 'asset.js'), 'utf8'), 'keep me');
        assert.equal(fs.readFileSync(path.join(dist, 'stories', 'series', 'index.html'), 'utf8'), '<h1>Custom builder output</h1>');
        assert.equal(fs.existsSync(path.join(dist, 'blog', 'index.html')), true);
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro runtime builds a site before starting preview when no output exists', async () => {
    const fixture = createFixture();
    try {
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn([]),
            captureScreenshot: async () => ({ buffer: Buffer.from('fake-jpeg-preview'), viewport: { width: 1200, height: 675 } })
        });
        const preview = await runtime.startPreview('project-1', 'site-1');
        try {
            const page = await get(preview.url);
            assert.equal(page.status, 200);
            assert.equal(page.body, '<h1>Built site</h1>');
        } finally {
            await runtime.stopPreview('project-1', 'site-1');
        }
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Astro runtime builds and serves a draft preview without recording a persistent Site build', async () => {
    const fixture = createFixture();
    let draft;
    try {
        draft = fixture.siteRepository.createPreviewDraft('project-1', {
            id: 'draft-preview-one', name: 'Draft Preview', template_id: 'minimal-homepage', customization: {}
        });
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn([])
        });
        const preview = await runtime.startDraftPreview(draft);
        try {
            const page = await get(preview.url);
            assert.equal(page.status, 200);
            assert.equal(page.body, '<h1>Built site</h1>');
            assert.equal(fixture.siteRepository.get('project-1', 'site-1').last_build, undefined);
        } finally {
            await runtime.stopDraftPreview('project-1', draft.id);
        }
    } finally {
        if (draft) fixture.siteRepository.removePreviewDraft(draft);
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});

test('Garden build filters notes using the template-declared publication input and returns a summary', async () => {
    const fixture = createFixture();
    try {
        const vaultRoot = path.join(fixture.workspaceDir, 'vault');
        fs.mkdirSync(vaultRoot, { recursive: true });
        fs.writeFileSync(path.join(vaultRoot, 'Public.md'), '---\npublication: public\n---\n\nPublic note.\n');
        fs.writeFileSync(path.join(vaultRoot, 'Private.md'), '---\npublication: private\n---\n\nPrivate note.\n');
        const setupInputs = [
            { id: 'knowledge_collection_root', type: 'directory', purpose: 'knowledge_collection', required: true },
            { id: 'publication_filter', type: 'frontmatter_match', purpose: 'publication_filter', required: true }
        ];
        const templates = {
            ...fixture.templates,
            get: (id) => {
                const template = fixture.templates.get(id);
                return { ...template, resource: { ...template.resource, template: { setup_inputs: setupInputs } } };
            }
        };
        const manifestPath = path.join(fixture.site.root_path, '.bloggenius/site.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        manifest.setup_inputs = {
            knowledge_collection_root: vaultRoot,
            publication_filter: { field: 'publication', value: 'public' }
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn([]),
            captureScreenshot: async () => ({ buffer: Buffer.from('garden-build'), viewport: { width: 1200, height: 675 } })
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.deepEqual(result.knowledge_collection, {
            source_markdown_count: 2,
            published_note_count: 1,
            excluded_note_count: 1,
            copied_resource_count: 0,
            copied_resource_bytes: 0,
            unresolved_link_count: 0,
            missing_resource_count: 0,
            selection_configured: true
        });
        const generated = fs.readdirSync(path.join(fixture.site.root_path, 'site-data/data/knowledge/notes'));
        assert.equal(generated.length, 1);
        assert.match(fs.readFileSync(path.join(fixture.site.root_path, 'site-data/data/knowledge/notes', generated[0]), 'utf8'), /Public note/);
        assert.doesNotMatch(fs.readFileSync(path.join(fixture.site.root_path, 'site-data/data/knowledge/notes', generated[0]), 'utf8'), /Private note/);
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});
