const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsProjectRepository } = require('./project-repository');

test('project repository atomically persists and updates one file per project', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-projects-'));
    try {
        const repository = createCardNewsProjectRepository({ workspaceDir });
        repository.save({ id: 'one', title: '첫 프로젝트', updated_at: '2026-09-04T01:00:00Z' });
        repository.save({ id: 'two', title: '둘째 프로젝트', updated_at: '2026-09-04T02:00:00Z' });
        repository.save({ id: 'one', title: '수정한 프로젝트', updated_at: '2026-09-04T03:00:00Z' });

        assert.equal(repository.get('one').title, '수정한 프로젝트');
        assert.deepEqual(repository.list().map((item) => item.id), ['one', 'two']);
        assert.equal(fs.existsSync(repository.projectFilePath('one')), true);
        assert.equal(fs.existsSync(repository.projectFilePath('two')), true);
        assert.equal(fs.readdirSync(path.dirname(repository.projectFilePath('one'))).some((name) => name.endsWith('.tmp')), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('project repository removes the unsupported legacy aggregate without migrating it', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-projects-'));
    try {
        const legacyPath = path.join(workspaceDir, 'card-news', 'projects.json');
        fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
        fs.writeFileSync(legacyPath, JSON.stringify({ projects: [{ id: 'legacy' }] }));

        const repository = createCardNewsProjectRepository({ workspaceDir });

        assert.equal(fs.existsSync(legacyPath), false);
        assert.deepEqual(repository.list(), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('project repository rejects unsafe project ids', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-projects-'));
    try {
        const repository = createCardNewsProjectRepository({ workspaceDir });
        assert.throws(() => repository.get('../outside'), { code: 'CARD_NEWS_PROJECT_ID_INVALID' });
        assert.throws(() => repository.save({ id: '../outside' }));
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('project repository returns clones instead of mutable store references', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-projects-'));
    try {
        const repository = createCardNewsProjectRepository({ workspaceDir });
        repository.save({ id: 'one', nested: { value: 'safe' }, updated_at: '2026-09-04T01:00:00Z' });
        const loaded = repository.get('one');
        loaded.nested.value = 'changed outside';
        assert.equal(repository.get('one').nested.value, 'safe');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
