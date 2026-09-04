const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsProjectRepository } = require('./project-repository');

test('project repository atomically persists and updates projects in workspace', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-projects-'));
    try {
        const repository = createCardNewsProjectRepository({ workspaceDir });
        repository.save({ id: 'one', title: '첫 프로젝트', updated_at: '2026-09-04T01:00:00Z' });
        repository.save({ id: 'two', title: '둘째 프로젝트', updated_at: '2026-09-04T02:00:00Z' });
        repository.save({ id: 'one', title: '수정한 프로젝트', updated_at: '2026-09-04T03:00:00Z' });

        assert.equal(repository.get('one').title, '수정한 프로젝트');
        assert.deepEqual(repository.list().map((item) => item.id), ['one', 'two']);
        assert.equal(fs.existsSync(repository.filePath), true);
        assert.equal(fs.readdirSync(path.dirname(repository.filePath)).some((name) => name.endsWith('.tmp')), false);
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
