const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildContentNewsQueryPlan,
    collectOwnerTopics,
    collectTrendTopics,
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

test('keeps a bounded multi-topic Trends pool for serendipity rotation', () => {
    const snapshot = trendSnapshot();
    snapshot.items = Array.from({ length: 14 }, (_, index) => ({
        ...snapshot.items[0],
        id: `trend-${index + 1}`,
        title: `뜻밖의 주제 ${index + 1}`,
        keyword: `뜻밖의 주제 ${index + 1}`,
        display_order: index + 1
    }));
    const plan = buildContentNewsQueryPlan({ knowledge: [snapshot] }, {}, {
        now: '2026-08-24T00:10:00.000Z'
    });
    assert.equal(plan.queries.length, 10);
    assert.equal(plan.queries.every((item) => item.lane === 'trends'), true);
});

test('serendipity mode starts with three rotating domains independent of owner and Trends', () => {
    const first = buildContentNewsQueryPlan({
        serendipity: true,
        discovery_offset: 0,
        knowledge: [trendSnapshot()]
    }, {}, { now: '2026-08-24T00:10:00.000Z' });
    const second = buildContentNewsQueryPlan({
        serendipity: true,
        discovery_offset: 1,
        knowledge: [trendSnapshot()]
    }, {}, { now: '2026-08-24T00:10:00.000Z' });

    assert.deepEqual(first.queries.slice(0, 3).map((item) => [item.lane, item.topic]), [
        ['discovery', '과학 발견'], ['discovery', '생활 변화'], ['discovery', '여행 문화']
    ]);
    assert.deepEqual(second.queries.slice(0, 3).map((item) => item.topic), [
        '음식 취향', '환경 기후', '건강 습관'
    ]);
});

test('serendipity mode rotates independent owner and Trends pools after the News domains', () => {
    const snapshot = trendSnapshot();
    snapshot.items = ['첫 트렌드', '둘째 트렌드', '셋째 트렌드'].map((topic, index) => ({
        ...snapshot.items[0], id: `trend-${index}`, title: topic, keyword: topic
    }));
    const signals = ['최근 기록', '이전 기록', '오래된 기록'].map((subject, index) => ({
        subject, stage: 'published', strength: 'strong',
        timestamp: `2026-08-${23 - index}T20:00:00.000Z`, evidence: { kind: 'event', id: `event:${index}` }
    }));
    const plan = buildContentNewsQueryPlan({
        serendipity: true,
        discovery_offsets: { news: 2, trends: 1, owner: 2 },
        knowledge: [snapshot]
    }, { owner_activity: { signals } }, { now: '2026-08-24T00:10:00.000Z' });

    assert.deepEqual(plan.queries.slice(0, 3).map((item) => item.topic), [
        '디자인 예술', '교육 배움', '창업 아이디어'
    ]);
    assert.deepEqual(plan.queries.filter((item) => item.lane === 'owner_activity').map((item) => item.topic), [
        '오래된 기록', '최근 기록', '이전 기록'
    ]);
    assert.deepEqual(plan.queries.filter((item) => item.lane === 'trends').map((item) => item.topic), [
        '둘째 트렌드', '셋째 트렌드', '첫 트렌드'
    ]);
});

test('serendipity source lookback prefers one week but accepts at most two weeks', () => {
    const now = '2026-08-24T00:10:00.000Z';
    const ownerTopics = collectOwnerTopics({ owner_activity: { signals: [
        { subject: '일주일 기록', stage: 'published', timestamp: '2026-08-17T00:10:00.000Z', evidence: { kind: 'event', id: 'event:week' } },
        { subject: '이주 기록', stage: 'saved', timestamp: '2026-08-10T00:10:00.000Z', evidence: { kind: 'event', id: 'event:fortnight' } },
        { subject: '범위 밖 기록', stage: 'drafted', timestamp: '2026-08-10T00:09:59.000Z', evidence: { kind: 'event', id: 'event:old' } }
    ] } }, { now, maxAgeDays: 14 });
    assert.deepEqual(ownerTopics.map((item) => [item.topic, item.recency_band]), [
        ['일주일 기록', 'recent_week'], ['이주 기록', 'recent_fortnight']
    ]);

    const snapshot = trendSnapshot();
    snapshot.expires_at = '2026-08-20T01:00:00.000Z';
    snapshot.items = [
        { ...snapshot.items[0], id: 'trend-week', title: '일주일 트렌드', keyword: '일주일 트렌드', observed_at: '2026-08-17T00:10:00.000Z' },
        { ...snapshot.items[0], id: 'trend-fortnight', title: '이주 트렌드', keyword: '이주 트렌드', observed_at: '2026-08-10T00:10:00.000Z' },
        { ...snapshot.items[0], id: 'trend-old', title: '오래된 트렌드', keyword: '오래된 트렌드', observed_at: '2026-08-09T00:10:00.000Z' }
    ];
    const trendTopics = collectTrendTopics([snapshot], now, { maxAgeDays: 14, allowExpiredSnapshot: true });
    assert.deepEqual(trendTopics.map((item) => [item.topic, item.recency_band]), [
        ['일주일 트렌드', 'recent_week'], ['이주 트렌드', 'recent_fortnight']
    ]);
    assert.equal(trendTopics[1].evidence_expires_at, now);
});
