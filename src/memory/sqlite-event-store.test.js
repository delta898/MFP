const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRecommendation } = require('../recommendations/core/test-fixtures');
const { createRecommendationCenterService } = require('../ui-api/services/recommendation-center.service');
const { SQLiteEventStore, SQLITE_MEMORY_FILENAME } = require('./sqlite-event-store');

function fixture() {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-sqlite-memory-'));
    const store = new SQLiteEventStore({ baseDir, Logger: { info() {}, warn() {} } });
    return {
        baseDir,
        store,
        close() {
            store.close();
            fs.rmSync(baseDir, { recursive: true, force: true });
        }
    };
}

test('SQLite V2는 owner identity와 storage generation을 준비한다', async () => {
    const f = fixture();
    try {
        assert.equal(await f.store.initialize(), true);
        assert.match(f.store.getLocalOwnerIdentity().owner_user_id, /^local:/);
        assert.equal(f.store.database.get("SELECT value FROM memory_meta WHERE key = 'storage_generation'").value, '2');
        assert.equal(fs.existsSync(path.join(f.baseDir, 'data', SQLITE_MEMORY_FILENAME)), true);
        assert.equal(f.store.database.quickCheck().ok, true);
    } finally { f.close(); }
});

test('topic event는 artifact와 facet insight를 함께 materialize한다', async () => {
    const f = fixture();
    try {
        await f.store.recordTopic('telegram-user', {
            subject: 'Electron 앱 안정화',
            category: 'N:개발',
            keywords: 'Electron, SQLite',
            platform: 'Naver'
        });
        const topics = await f.store.getTopicSummary('telegram-user');
        assert.equal(topics[0].subject, 'Electron 앱 안정화');
        const semantics = await f.store.getOwnerTopicSemanticSummary();
        assert.deepEqual(semantics.keywords.map((item) => item.normalized_value).sort(), ['electron', 'sqlite']);
        assert.equal(semantics.categories[0].normalized_value, '개발');
        assert.equal(semantics.platforms[0].normalized_value, 'naver');
    } finally { f.close(); }
});

test('activity evidence는 중복 제거되고 owner profile에 반영된다', async () => {
    const f = fixture();
    try {
        const owner = (await f.store.initialize(), f.store.getLocalOwnerIdentity().owner_user_id);
        const input = {
            owner_user_id: owner,
            domain: 'blog',
            stage: 'selected',
            subject: 'SQLite 기반 메모리',
            source: 'blog-next',
            evidence_id: 'selection:sqlite-memory',
            timestamp: '2026-09-14T00:00:00.000Z'
        };
        assert.equal((await f.store.recordActivityLifecycle(input)).deduplicated, false);
        assert.equal((await f.store.recordActivityLifecycle(input)).deduplicated, true);
        const profile = await f.store.getOwnerProfileProjection(owner);
        assert.equal(profile.activity.counts_by_stage.selected, 1);
        assert.equal(profile.activity.recent_subjects[0].subject, 'SQLite 기반 메모리');
    } finally { f.close(); }
});

test('recommendation 생성·조회·전환은 SQLite V2 store contract로 동작한다', async () => {
    const f = fixture();
    try {
        await f.store.initialize();
        const owner = f.store.getLocalOwnerIdentity().owner_user_id;
        const source = createRecommendation({
            owner_user_id: owner,
            candidate: { ...createRecommendation().candidate, owner_user_id: owner }
        });
        const created = await f.store.createRecommendation(source, { operation_id: 'sqlite-create' });
        assert.equal(created.recommendation.status, 'available');
        assert.equal((await f.store.listRecommendations(owner)).length, 1);
        const dismissed = await f.store.transitionRecommendation({
            owner_user_id: owner,
            recommendation_id: source.recommendation_id,
            event_type: 'recommendation.dismissed',
            operation_id: 'sqlite-dismiss',
            occurred_at: '2026-09-14T01:00:00.000Z'
        });
        assert.equal(dismissed.recommendation.status, 'dismissed');
        assert.deepEqual(f.store.getRecommendationStoreStatus(), { mode: 'persistent', reason: '' });
    } finally { f.close(); }
});

test('maintenance는 만료된 종료 추천을 제한적으로 정리하고 DB 진단을 반환한다', async () => {
    const f = fixture();
    try {
        await f.store.initialize();
        const owner = f.store.getLocalOwnerIdentity().owner_user_id;
        const source = createRecommendation({ owner_user_id: owner, candidate: { ...createRecommendation().candidate, owner_user_id: owner } });
        await f.store.createRecommendation(source, { operation_id: 'maintenance-create' });
        await f.store.transitionRecommendation({ owner_user_id: owner, recommendation_id: source.recommendation_id, event_type: 'recommendation.rotated', operation_id: 'maintenance-rotate', occurred_at: '2026-08-25T01:00:00.000Z' });
        const result = await f.store.runMaintenance({ now: '2026-10-01T00:00:00.000Z', terminalDays: 30 });
        assert.equal((await f.store.listRecommendations(owner)).length, 0);
        assert.equal(result.after.file_bytes > 0, true);
    } finally { f.close(); }
});

test('반복 recommendation 상태 전환은 immutable JSON storage를 증폭시키지 않는다', async () => {
    const f = fixture();
    try {
        await f.store.initialize();
        const owner = f.store.getLocalOwnerIdentity().owner_user_id;
        const template = createRecommendation();
        for (let index = 0; index < 300; index += 1) {
            const recommendation = {
                ...template,
                recommendation_id: `recommendation:growth:${index}`,
                owner_user_id: owner,
                candidate: {
                    ...template.candidate,
                    candidate_id: `candidate:growth:${index}`,
                    owner_user_id: owner,
                    dedupe_key: `growth:${index}`
                }
            };
            await f.store.createRecommendation(recommendation, { operation_id: `create:${index}` });
            await f.store.transitionRecommendation({
                owner_user_id: owner,
                recommendation_id: recommendation.recommendation_id,
                event_type: 'recommendation.rotated',
                operation_id: `rotate:${index}`,
                occurred_at: '2026-08-25T11:00:00.000Z'
            });
        }
        f.store.database.checkpoint('TRUNCATE');
        const diagnostics = f.store.database.diagnostics();
        assert.equal(f.store.database.get('SELECT count(*) AS count FROM recommendation_events').count, 600);
        assert.equal(diagnostics.file_bytes < 8 * 1024 * 1024, true, `unexpected SQLite growth: ${diagnostics.file_bytes}`);
    } finally { f.close(); }
});

test('오래된 raw topic을 정리해도 압축된 topic affinity insight는 유지한다', async () => {
    const f = fixture();
    try {
        await f.store.initialize();
        const owner = f.store.getLocalOwnerIdentity().owner_user_id;
        await f.store.appendEvent({
            event_type: 'content.topic.registered',
            actor_type: 'system',
            actor_id: 'SYSTEM',
            owner_user_id: owner,
            timestamp: '2025-01-01T00:00:00.000Z',
            payload: { subject: '오래된 글감', keywords: '장기 관심사', source: 'test' }
        });
        await f.store.runMaintenance({ now: '2026-01-01T00:00:00.000Z', batchSize: 200 });
        assert.equal((await f.store.listOwnerArtifacts(owner, { artifactType: 'topic' })).length, 0);
        const semantics = await f.store.getOwnerTopicSemanticSummary(owner);
        assert.equal(semantics.keywords[0].normalized_value, '장기 관심사');
        assert.deepEqual(semantics.keywords[0].evidence_contexts, []);
    } finally { f.close(); }
});

test('글감 추천 UI service는 SQLite V2 목록과 handoff를 그대로 사용한다', async () => {
    const f = fixture();
    try {
        await f.store.initialize();
        const owner = f.store.getLocalOwnerIdentity().owner_user_id;
        const template = createRecommendation();
        const recommendation = {
            ...template,
            owner_user_id: owner,
            candidate: { ...template.candidate, owner_user_id: owner }
        };
        await f.store.createRecommendation(recommendation, { operation_id: 'ui-create' });
        const handoffs = [];
        const service = createRecommendationCenterService({
            eventStore: f.store,
            handoffService: {
                async prepare(input) { handoffs.push(input); return { status: 'presentation' }; },
                async decide() { return { status: 'decided' }; }
            },
            now: () => new Date('2026-08-23T02:00:00.000Z'),
            operationIdFactory: () => 'sqlite-ui-operation'
        });
        const listed = await service.list();
        assert.equal(listed.count, 1);
        assert.equal(listed.items[0].title, 'AI 글쓰기 정책 변화');
        assert.deepEqual(listed.store, { mode: 'persistent', reason: '' });
        assert.equal((await service.interact({ recommendation_id: recommendation.recommendation_id, interaction: 'open' })).status, 'presentation');
        assert.deepEqual(handoffs[0], { ownerUserId: owner, recommendationId: recommendation.recommendation_id });
    } finally { f.close(); }
});

test('content.generate 결과는 글감 artifact와 feedback target으로 이어진다', async () => {
    const f = fixture();
    try {
        await f.store.appendEvent({
            event_type: 'capability.completed',
            actor_type: 'user',
            actor_id: 'writer',
            conversation_id: 'blog-next:writer',
            message_id: 'message:content-idea',
            payload: {
                action: {
                    id: 'action:content-idea',
                    type: 'content.generate',
                    domain: 'blog',
                    name: 'recommend_topics'
                },
                result: {
                    success: true,
                    data: {
                        ideas: [{
                            id: 'idea:sqlite-memory',
                            title: 'SQLite 메모리 전환기',
                            summary: '로컬 메모리 안정화 경험',
                            feedback_key: 'sqlite-memory',
                            recommendation: { run_id: 'run:sqlite', candidate_id: 'candidate:sqlite' }
                        }]
                    }
                }
            }
        });

        const artifacts = await f.store.listRecentArtifacts('blog-next:writer', 'content_idea');
        assert.equal(artifacts.length, 1);
        assert.equal(artifacts[0].payload.feedback_key, 'sqlite-memory');
        const target = await f.store.getFeedbackTarget('artifact', 'idea:sqlite-memory');
        assert.equal(target.domain, 'blog');
        assert.equal(target.entity_ref, 'idea:sqlite-memory');
        assert.equal(target.subject, 'SQLite 메모리 전환기');
        assert.equal(target.artifact_type, 'content_idea');
        assert.equal(target.recommendation.run_id, 'run:sqlite');
        assert.equal(target.recommendation.candidate_id, 'candidate:sqlite');
    } finally { f.close(); }
});

test('제안 feedback은 이전 event의 feedback key를 재사용해 preference를 누적한다', async () => {
    const f = fixture();
    try {
        await f.store.appendEvent({
            event_type: 'suggestion.accepted',
            actor_type: 'user',
            actor_id: 'writer',
            payload: {
                suggestion_id: 'suggestion:sqlite',
                type: 'content_idea',
                summary: 'SQLite 글감',
                feedback_key: 'sqlite-memory'
            }
        });
        await f.store.appendEvent({
            event_type: 'suggestion.helpful',
            actor_type: 'user',
            actor_id: 'writer',
            payload: { suggestion_id: 'suggestion:sqlite' }
        });

        const [preference] = await f.store.listUserPreferences('writer');
        assert.equal(preference.name, 'suggestion_feedback.sqlite-memory');
        assert.equal(preference.value.accepted_count, 1);
        assert.equal(preference.value.helpful_count, 1);
        assert.equal(preference.evidence_count, 2);
        assert.equal(f.store.database.get('SELECT status FROM suggestions WHERE id = :id', { id: 'suggestion:sqlite' }).status, 'helpful');
    } finally { f.close(); }
});

test('빈 interaction message와 insight는 저장하지 않는다', async () => {
    const f = fixture();
    try {
        assert.equal(await f.store.recordInteractionMessage({ channel: 'local' }, '   '), null);
        assert.equal(await f.store.updateUserInsight('writer', '   '), null);
        await f.store.initialize();
        assert.equal(f.store.database.get('SELECT count(*) AS count FROM events').count, 0);
    } finally { f.close(); }
});
