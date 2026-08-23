const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildContentNewsQueryPlan,
    isUsableTopic,
    normalizeTopicKey
} = require('./content-query-plan');

function trendSnapshot(keyword = 'AI 에이전트') {
    return {
        schema_version: 1,
        snapshot_id: 'ks_trends_fixture',
        kind: 'trends',
        provider_id: 'naver-trends',
        transport: 'builtin_api',
        freshness: 'fresh',
        observed_at: '2026-08-24T00:00:00.000Z',
        expires_at: '2026-08-24T01:00:00.000Z',
        items: [{
            id: 'trend-1', title: keyword, summary: '상승', observed_at: '2026-08-23T15:00:00.000Z',
            url: '', source: 'naver-trend-posting', publisher: '', keyword, categories: ['IT'],
            change_type: 'up', change_amount: 3, score: 3, display_order: 1
        }]
    };
}

test('builds one bounded News query from explicit, owner and Trends lanes', () => {
    const plan = buildContentNewsQueryPlan({ query: '생성형 AI', knowledge: [trendSnapshot()] }, {
        owner_activity: { signals: [{
            subject: '워드프레스 자동화', stage: 'published', strength: 'strong',
            timestamp: '2026-08-23T20:00:00.000Z', evidence: { kind: 'event', id: 'event:publish:1' }
        }] }
    }, { now: '2026-08-24T00:10:00.000Z' });

    assert.deepEqual(plan.queries.map((item) => [item.lane, item.topic]), [
        ['explicit', '생성형 AI'],
        ['owner_activity', '워드프레스 자동화'],
        ['trends', 'AI 에이전트']
    ]);
    assert.equal(plan.queries.length, 3);
});

test('merges duplicate topic lanes while preserving every evidence basis', () => {
    const plan = buildContentNewsQueryPlan({ query: 'AI 에이전트', knowledge: [trendSnapshot()] }, {
        owner_activity: { signals: [{
            subject: 'AI 에이전트', stage: 'saved', strength: 'medium',
            timestamp: '2026-08-23T20:00:00.000Z', evidence: { kind: 'artifact', id: 'topic:1' }
        }] }
    }, { now: '2026-08-24T00:10:00.000Z' });

    assert.equal(plan.queries.length, 1);
    assert.deepEqual(plan.queries[0].bases.map((item) => item.lane), ['explicit', 'owner_activity', 'trends']);
});

test('rejects generic input and generated-only activity as owner query evidence', () => {
    const plan = buildContentNewsQueryPlan({ query: '최신 뉴스' }, {
        owner_activity: { signals: [{
            subject: '게임 신작', stage: 'generated', strength: 'weak',
            timestamp: '2026-08-23T20:00:00.000Z', evidence: { kind: 'artifact', id: 'idea:1' }
        }] }
    }, { now: '2026-08-24T00:10:00.000Z' });

    assert.deepEqual(plan.queries, []);
    assert.equal(isUsableTopic('뉴스'), false);
    assert.equal(isUsableTopic('AI 최신 뉴스'), true);
    assert.equal(normalizeTopicKey(' AI 에이전트! '), 'ai에이전트');
});

test('reads owner activity from the real memory context packet shape', () => {
    const plan = buildContentNewsQueryPlan({}, {
        memory: { owner_memory: {
            activity: { signals: [{
                subject: '블로그 운영 자동화', stage: 'published', strength: 'strong',
                timestamp: '2026-08-23T22:00:00.000Z', evidence: { kind: 'event', id: 'event:published:1' }
            }] },
            profile: { activity: { recent_subjects: [{
                subject: '오래된 저장 글감', stage: 'saved', strength: 'medium',
                timestamp: '2026-08-22T22:00:00.000Z', evidence: { kind: 'artifact', id: 'topic:old' }
            }] } }
        } }
    }, { now: '2026-08-24T00:10:00.000Z' });

    assert.equal(plan.queries.length, 1);
    assert.equal(plan.queries[0].lane, 'owner_activity');
    assert.equal(plan.queries[0].topic, '블로그 운영 자동화');
});
