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
