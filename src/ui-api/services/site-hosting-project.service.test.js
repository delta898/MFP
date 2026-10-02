'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSiteHostingProjectService } = require('./site-hosting-project.service');

test('site hosting project service creates, lists, and opens projects', () => {
    const projects = new Map();
    const repository = {
        create(project) { projects.set(project.id, { ...project, root_path: `/workspace/${project.id}`, site_count: 0 }); return projects.get(project.id); },
        list() { return [...projects.values()]; },
        get(id) { return projects.get(id) || null; }
    };
    const service = createSiteHostingProjectService({
        repository,
        createId: () => 'project-1',
        now: () => '2026-10-02T00:00:00.000Z'
    });

    const created = service.create({ name: '  개인 사이트  ' });
    assert.equal(created.name, '개인 사이트');
    assert.equal(created.root_domain, '');
    assert.deepEqual(service.list().map(({ id, name, site_count }) => ({ id, name, site_count })), [
        { id: 'project-1', name: '개인 사이트', site_count: 0 }
    ]);
    assert.equal(service.get('project-1').root_path, '/workspace/project-1');
});

test('site hosting project service creates one default project when workspace is empty', () => {
    const projects = new Map();
    const repository = {
        create(project) {
            if (projects.has(project.id)) throw new Error('already exists');
            const value = { ...project, root_path: `/workspace/${project.id}`, site_count: 0 };
            projects.set(project.id, value);
            return value;
        },
        list() { return [...projects.values()]; },
        get(id) { return projects.get(id) || null; }
    };
    const service = createSiteHostingProjectService({ repository, now: () => '2026-10-02T00:00:00.000Z' });

    assert.deepEqual(service.list().map(({ id, name }) => ({ id, name })), [{ id: 'default', name: '내 사이트' }]);
    assert.deepEqual(service.list().map(({ id }) => id), ['default']);
});

test('site hosting project service validates names and reports missing projects', () => {
    const service = createSiteHostingProjectService({
        repository: { list: () => [], get: () => null, create: (value) => value },
        createId: () => 'project-1'
    });
    assert.throws(() => service.create({ name: '   ' }), { code: 'SITE_HOSTING_PROJECT_NAME_REQUIRED', status: 400 });
    assert.throws(() => service.create({ name: 'n'.repeat(81) }), { code: 'SITE_HOSTING_PROJECT_NAME_TOO_LONG', status: 400 });
    assert.throws(() => service.get('missing'), { code: 'SITE_HOSTING_PROJECT_NOT_FOUND', status: 404 });
});
