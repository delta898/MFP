'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('./project-repository');
const { createSiteHostingSiteRepository } = require('./site-repository');
const { createSiteTemplateCatalog } = require('./site-template-catalog');

test('site repository materializes selected Astro files and keeps BlogGenius metadata separate', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createSiteTemplateCatalog({ fs, path })
        });
        const site = repository.create('project-1', {
            id: 'site-1', name: '개인 블로그', template_id: 'minimal-homepage',
            created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z'
        });
        const siteRoot = path.join(workspaceDir, 'site-hosting', 'projects', 'project-1', 'sites', 'site-1');
        const metadata = JSON.parse(fs.readFileSync(path.join(siteRoot, '.bloggenius', 'site.json'), 'utf8'));

        assert.equal(fs.existsSync(path.join(siteRoot, 'src', 'pages', 'index.astro')), true);
        assert.equal(metadata.id, 'site-1');
        assert.equal(metadata.name, '개인 블로그');
        assert.deepEqual(metadata.template, { id: 'minimal-homepage', version: '0.1.0' });
        assert.equal(site.project_id, 'project-1');
        assert.equal(site.template_name, '간단한 홈페이지');
        assert.deepEqual(repository.list('project-1').map(({ id, name }) => ({ id, name })), [{ id: 'site-1', name: '개인 블로그' }]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository rejects unsafe and duplicate IDs without replacing an existing site', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-id-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createSiteTemplateCatalog({ fs, path })
        });
        assert.throws(() => repository.create('project-1', { id: '../outside', name: '잘못된 ID', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ID_INVALID' });
        repository.create('project-1', { id: 'site-1', name: '첫 사이트', template_id: 'minimal-homepage' });
        assert.throws(() => repository.create('project-1', { id: 'site-1', name: '덮어쓰기', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ALREADY_EXISTS' });
        assert.equal(repository.get('project-1', 'site-1').name, '첫 사이트');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
