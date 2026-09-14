const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecommendation } = require('../recommendations/core/test-fixtures');
const { RecommendationLifecycleStore } = require('../recommendations/lifecycle-store');
const { SQLiteDatabase } = require('./sqlite-database');
const { SQLiteRecommendationRepository } = require('./sqlite-recommendation-repository');

function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-sqlite-recommendation-'));
    const database = new SQLiteDatabase({ filePath: path.join(directory, 'memory.sqlite3') }).open();
    database.exec(`
        CREATE TABLE owners (id TEXT PRIMARY KEY) STRICT;
        INSERT INTO owners(id) VALUES ('owner-local');
    `);
    const repository = new SQLiteRecommendationRepository({ database });
    repository.initializeSchema();
    return {
        directory,
        database,
        repository,
        close() {
            database.close();
            fs.rmSync(directory, { recursive: true, force: true });
        }
    };
}

test('SQLite recommendation lifecycle은 기존 contract를 보존한다', async () => {
    const f = fixture();
    try {
        const store = new RecommendationLifecycleStore({ repository: f.repository });
        const recommendation = createRecommendation();
        const created = await store.createRecommendation(recommendation, { operation_id: 'create-1' });
        assert.equal(created.recommendation.status, 'available');

        const rotated = await store.transitionRecommendation({
            owner_user_id: recommendation.owner_user_id,
            recommendation_id: recommendation.recommendation_id,
            event_type: 'recommendation.rotated',
            operation_id: 'rotate-1',
            occurred_at: '2026-08-25T11:00:00.000Z'
        });
        assert.equal(rotated.recommendation.status, 'rotated');
        assert.equal((await f.repository.get('owner-local', recommendation.recommendation_id)).candidate.title, created.recommendation.candidate.title);
        assert.equal(f.database.get('SELECT count(*) AS count FROM recommendation_events').count, 2);
    } finally {
        f.close();
    }
});

test('관찰 이벤트는 immutable candidate와 projection 상태를 다시 쓰지 않는다', async () => {
    const f = fixture();
    try {
        const store = new RecommendationLifecycleStore({ repository: f.repository });
        const recommendation = createRecommendation();
        await store.createRecommendation(recommendation, { operation_id: 'create-observed' });
        const before = f.database.get('SELECT candidate_json, status, last_event_at FROM recommendations WHERE id = :id', { id: recommendation.recommendation_id });

        await store.transitionRecommendation({
            owner_user_id: recommendation.owner_user_id,
            recommendation_id: recommendation.recommendation_id,
            event_type: 'recommendation.opened',
            operation_id: 'opened-1',
            occurred_at: '2026-08-25T11:00:00.000Z'
        });
        const after = f.database.get('SELECT candidate_json, status, last_event_at FROM recommendations WHERE id = :id', { id: recommendation.recommendation_id });
        assert.deepEqual(after, before);
        assert.equal(f.database.get('SELECT count(*) AS count FROM recommendation_events').count, 2);
    } finally {
        f.close();
    }
});

test('종료 추천 retention은 오래된 추천과 관련 이벤트를 cascade 정리한다', async () => {
    const f = fixture();
    try {
        const store = new RecommendationLifecycleStore({ repository: f.repository });
        const recommendation = createRecommendation();
        await store.createRecommendation(recommendation, { operation_id: 'create-prune' });
        await store.transitionRecommendation({
            owner_user_id: recommendation.owner_user_id,
            recommendation_id: recommendation.recommendation_id,
            event_type: 'recommendation.rotated',
            operation_id: 'rotate-prune',
            occurred_at: '2026-08-25T11:00:00.000Z'
        });
        f.repository.prune({ now: '2026-10-01T00:00:00.000Z', terminalDays: 30 });
        assert.equal(f.database.get('SELECT count(*) AS count FROM recommendations').count, 0);
        assert.equal(f.database.get('SELECT count(*) AS count FROM recommendation_events').count, 0);
    } finally {
        f.close();
    }
});

test('SQLite transaction 오류는 전체 recommendation write를 rollback한다', async () => {
    const f = fixture();
    try {
        const recommendation = createRecommendation();
        f.database.exec(`CREATE TRIGGER reject_recommendation_event BEFORE INSERT ON recommendation_events BEGIN SELECT RAISE(ABORT, 'event rejected'); END;`);
        await assert.rejects(f.repository.saveEventAndProjection({
            id: 'event-rejected',
            event_type: 'recommendation.created',
            timestamp: recommendation.last_event_at,
            payload: {}
        }, recommendation), /event rejected/);
        assert.equal(f.database.get('SELECT count(*) AS count FROM recommendations').count, 0);
    } finally {
        f.close();
    }
});
