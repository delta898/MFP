'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('./project-repository');

test('site hosting project repository persists a project package and lists stable metadata', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-project-'));
    try {
        const repository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        const project = repository.create({
            id: 'project-one',
            name: '테스트 프로젝트',
            created_at: '2026-10-02T00:00:00.000Z',
            updated_at: '2026-10-02T00:00:00.000Z'
        });

        assert.equal(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'projects', 'project-one', 'project.json')), true);
        assert.equal(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'projects', 'project-one', 'sites')), true);
        assert.equal(project.id, 'project-one');
        assert.equal(project.site_count, 0);
        assert.deepEqual(repository.list().map(({ id, name }) => ({ id, name })), [{ id: 'project-one', name: '테스트 프로젝트' }]);
        assert.equal(repository.get('project-one').root_path, project.root_path);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site hosting project repository rejects unsafe and colliding IDs without overwriting data', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-project-id-'));
    try {
        const repository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        assert.throws(() => repository.get('../outside'), { code: 'SITE_HOSTING_PROJECT_ID_INVALID' });
        repository.create({ id: 'safe-id', name: '첫 번째' });
        assert.throws(() => repository.create({ id: 'safe-id', name: '덮어쓰기 시도' }), { code: 'SITE_HOSTING_PROJECT_ALREADY_EXISTS' });
        assert.equal(repository.get('safe-id').name, '첫 번째');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
