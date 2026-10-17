const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsProject, refreshCardNewsProject } = require('./project');

test('new project owns a durable source snapshot and empty generation state', () => {
    const project = createCardNewsProject({
        source_snapshot: { title: '원문 제목', text: '원문 본문' }
    }, {
        createId: () => 'project-1',
        now: () => '2026-09-04T05:00:00.000Z'
    });

    assert.equal(project.id, 'project-1');
    assert.equal(project.title, '원문 제목');
    assert.equal(project.revision, 1);
    assert.deepEqual(project.cards, []);
    assert.deepEqual(project.assets, []);
});

test('failed refresh preserves the last valid snapshot and generated state', async () => {
    const project = {
        id: 'project-1', title: '카드뉴스', revision: 4,
        source_snapshot: { title: '정상 원문', text: '잃으면 안 되는 본문' },
        cards: [{ id: 'card-1', copy: '기존 문구' }], assets: [{ id: 'asset-1' }],
        created_at: '2026-09-04T05:00:00.000Z', updated_at: '2026-09-04T05:00:00.000Z'
    };

    const refreshed = await refreshCardNewsProject(project, async () => {
        throw Object.assign(new Error('페이지 응답 없음'), { code: 'ETIMEDOUT' });
    }, { kind: 'url', url: 'https://example.com/post' }, {
        now: () => '2026-09-04T06:00:00.000Z'
    });

    assert.deepEqual(refreshed.source_snapshot, project.source_snapshot);
    assert.deepEqual(refreshed.cards, project.cards);
    assert.deepEqual(refreshed.assets, project.assets);
    assert.equal(refreshed.source_error.code, 'ETIMEDOUT');
    assert.equal(refreshed.revision, 5);
});

test('successful refresh replaces only source state and clears the error', async () => {
    const project = {
        id: 'project-1', title: '사용자 제목', revision: 2,
        source_snapshot: null, source_error: { code: 'OLD' },
        cards: [{ id: 'card-1' }], assets: [],
        created_at: '2026-09-04T05:00:00.000Z', updated_at: '2026-09-04T05:00:00.000Z'
    };
    const snapshot = { title: '원문 제목', text: '새 본문' };
    const refreshed = await refreshCardNewsProject(project, async () => snapshot, {}, {
        now: () => '2026-09-04T06:30:00.000Z'
    });

    assert.equal(refreshed.title, '사용자 제목');
    assert.deepEqual(refreshed.source_snapshot, snapshot);
    assert.equal(refreshed.source_error, null);
    assert.deepEqual(refreshed.cards, project.cards);
});
