'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteService } = require('./site-hosting-site.service');

test('site service lists templates and creates a named site without Cloudflare details', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-service-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository,
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z'
        });
        assert.equal(service.listTemplates()[0].id, 'minimal-homepage');
        const created = service.create('project-1', { name: '  개인 블로그  ', template_id: 'minimal-homepage' });
        assert.equal(created.name, '개인 블로그');
        assert.equal(created.hostname, '');
        assert.deepEqual(created.template, { id: 'minimal-homepage', version: '0.1.0' });
        assert.deepEqual(service.list('project-1').map(({ id, name }) => ({ id, name })), [{ id: 'site-1', name: '개인 블로그' }]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service validates the project, name, and selected template', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-validation-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, projectRepository, createId: () => 'site-1' });
        assert.throws(() => service.create('missing', { name: '사이트', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_PROJECT_NOT_FOUND' });
        assert.throws(() => service.create('project-1', { name: ' ', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_NAME_REQUIRED' });
        assert.throws(() => service.create('project-1', { name: '사이트', template_id: 'missing' }), { code: 'SITE_HOSTING_TEMPLATE_REQUIRED' });
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
            fs, path, workspaceDir, projectRepository,
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z',
            astroRuntime: { build: async () => { calls.push('build'); } },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'secret', account: { id: 'a'.repeat(32) } }),
            cloudflareDeployer: { deploy: async (_site, credentials) => {
                calls.push('deploy');
                assert.equal(credentials.account.id, 'a'.repeat(32));
                return { worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', deployment_id: 'deployment-1', version_id: 'version-1' };
            } }
        });
        service.create('project-1', { name: '개인 블로그', template_id: 'minimal-homepage' });
        const result = await service.deploy('project-1', 'site-1');
        assert.deepEqual(calls, ['build', 'deploy']);
        assert.equal(result.url, 'https://bg-site-1.example.workers.dev/');
        assert.equal(service.list('project-1')[0].deployment.worker_name, 'bg-site-1');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
