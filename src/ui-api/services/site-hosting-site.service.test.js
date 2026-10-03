'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');
const { createSiteHostingSiteService } = require('./site-hosting-site.service');

function localTemplates() {
    return createSiteTemplateCatalog({ fs, path });
}

test('site service lists templates and creates a named site without Cloudflare details', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-service-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(),
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z'
        });
        assert.equal((await service.listTemplates())[0].id, 'minimal-homepage');
        const created = await service.create('project-1', { name: '  개인 블로그  ', template_id: 'minimal-homepage' });
        assert.equal(created.name, '개인 블로그');
        assert.equal(created.hostname, '');
        assert.deepEqual(created.template, { id: 'minimal-homepage', version: '0.1.0' });
        const listed = await service.list('project-1');
        assert.deepEqual(listed.map(({ id, name }) => ({ id, name })), [{ id: 'site-1', name: '개인 블로그' }]);
        assert.match(listed[0].screenshot_url, /sites\/site-1\/screenshot$/);
        assert.equal(service.getScreenshot('project-1', 'site-1').contentType, 'image/svg+xml');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service validates the project, name, and selected template', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-validation-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'site-1' });
        await assert.rejects(service.create('missing', { name: '사이트', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_PROJECT_NOT_FOUND' });
        await assert.rejects(service.create('project-1', { name: ' ', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_NAME_REQUIRED' });
        await assert.rejects(service.create('project-1', { name: '사이트', template_id: 'missing' }), { code: 'SITE_HOSTING_TEMPLATE_REQUIRED' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service materializes the default starter site only for the default project', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-default-site-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'default', name: '내 사이트' });
        projectRepository.create({ id: 'other-project', name: '다른 프로젝트' });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, templates: localTemplates() });

        assert.deepEqual((await service.list('default')).map(({ id, name, template_name }) => ({ id, name, template_name })), [
            { id: 'default', name: '나의 첫 사이트', template_name: '간단한 홈페이지' }
        ]);
        assert.deepEqual((await service.list('default')).map(({ id }) => id), ['default']);
        assert.deepEqual(await service.list('other-project'), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service opens the built output folder and requests preview when it is missing', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-open-build-folder-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const opened = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'site-1',
            openPath: async (targetPath) => { opened.push(targetPath); return ''; }
        });
        await service.create('project-1', { name: '개인 블로그', template_id: 'minimal-homepage' });
        await assert.rejects(service.openBuildFolder('project-1', 'site-1'), { code: 'SITE_HOSTING_BUILD_REQUIRED', status: 409 });
        const distPath = path.join(workspaceDir, 'site-hosting', 'projects', 'project-1', 'sites', 'site-1', 'dist');
        fs.mkdirSync(distPath);
        assert.deepEqual(await service.openBuildFolder('project-1', 'site-1'), { opened: true });
        assert.deepEqual(opened, [distPath]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deploy rebuilds the site and saves the Cloudflare workers.dev result', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-deploy-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const calls = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(),
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z',
            astroRuntime: { build: async () => { calls.push('build'); return { screenshot: { path: '.bloggenius/build-build1.jpg', build_id: 'build1' } }; } },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'secret', account: { id: 'a'.repeat(32) } }),
            cloudflareDeployer: { deploy: async (_site, credentials) => {
                calls.push('deploy');
                assert.equal(credentials.account.id, 'a'.repeat(32));
                return { worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', deployment_id: 'deployment-1', version_id: 'version-1' };
            } }
        });
        await service.create('project-1', { name: '개인 블로그', template_id: 'minimal-homepage' });
        const result = await service.deploy('project-1', 'site-1');
        assert.deepEqual(calls, ['build', 'deploy']);
        assert.equal(result.url, 'https://bg-site-1.example.workers.dev/');
        assert.equal(result.screenshot.build_id, 'build1');
        assert.equal((await service.list('project-1'))[0].deployment.worker_name, 'bg-site-1');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
