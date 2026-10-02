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
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates,
            npmCliPath: '/app/node_modules/npm/bin/npm-cli.js',
            cacheRoot: path.join(fixture.workspaceDir, '.cache'),
            spawn: fakeNpmSpawn(calls)
        });
        const result = await runtime.build('project-1', 'site-1');
        assert.equal(result.status, 'succeeded');
        assert.deepEqual(calls.map(({ args }) => args.slice(1)), [['ci', '--no-audit', '--no-fund'], ['run', 'build']]);
        assert.equal(calls[0].options.env.BG_RUNTIME_TEST_SECRET, undefined);
        const runtimeBin = calls[0].options.env.PATH.split(path.delimiter)[0];
        assert.equal(fs.existsSync(path.join(runtimeBin, process.platform === 'win32' ? 'node.cmd' : 'node')), true);
        assert.equal(calls[0].options.env.BLOGGENIUS_NODE_EXECUTABLE, process.execPath);
        assert.equal(runtime.getBuildStatus('project-1', 'site-1').status, 'succeeded');

        const preview = await runtime.startPreview('project-1', 'site-1');
        try {
            assert.match(preview.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
            const page = await get(preview.url);
            assert.equal(page.status, 200);
            assert.match(page.headers['content-type'], /text\/html/);
            assert.equal(page.body, '<h1>Built site</h1>');
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

test('Astro runtime requires a build before starting preview', async () => {
    const fixture = createFixture();
    try {
        const runtime = createAstroSiteRuntime({
            fs, path, projectRepository: fixture.projectRepository,
            siteRepository: fixture.siteRepository, templates: fixture.templates
        });
        await assert.rejects(runtime.startPreview('project-1', 'site-1'), { code: 'SITE_HOSTING_BUILD_REQUIRED', status: 409 });
    } finally {
        fs.rmSync(fixture.workspaceDir, { recursive: true, force: true });
    }
});
