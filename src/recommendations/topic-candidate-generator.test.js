const test = require('node:test');
const assert = require('node:assert/strict');
const { createTopicCandidateGenerator } = require('./topic-candidate-generator');

function profile() {
    return {
        owner_user_id: 'local:test',
        interests: {
            keywords: [
                { value: 'AI', normalized_value: 'ai', evidence_count: 4, last_used_at: '2026-08-14', evidence: { kind: 'topic_facet', id: 'f1' } },
                { value: '워드프레스', normalized_value: '워드프레스', evidence_count: 2, last_used_at: '2026-08-10', evidence: { kind: 'topic_facet', id: 'f2' } }
            ],
            categories: [{ value: 'IT', normalized_value: 'it', evidence_count: 3, evidence: { kind: 'topic_facet', id: 'c1' } }],
            platforms: []
        }
    };
}

test('combines request, trend, and owner profile evidence without scoring', () => {
    const result = createTopicCandidateGenerator().generate({
        query: '블로그 자동화',
        ownerProfile: profile(),
        knowledge: [{
            provider_id: 'naver-trends',
            kind: 'trends',
            transport: 'builtin_api',
            items: [{
                title: 'AI 블로그 도구',
                timestamp: '2026-08-14T00:00:00+09:00',
                metadata: { source: 'naver_trend', categories: ['IT'], trend_date: '2026-08-14', change_type: 'up', change_amount: 7, display_order: 1 }
            }]
        }]
    });

    assert.deepEqual(result.candidates.map((item) => item.candidate_type), [
        'request_seed', 'trend_seed', 'profile_seed', 'profile_seed'
    ]);
    const trend = result.candidates[1];
    assert.equal(trend.owner_matches.keywords[0].normalized_value, 'ai');
    assert.equal(trend.owner_matches.categories[0].normalized_value, 'it');
    assert.equal(trend.source_refs[0].provider_id, 'naver-trends');
    assert.equal(Object.hasOwn(trend, 'score'), false);
});

test('excludes exact recent seeds and keeps stable candidate ids', () => {
    const generator = createTopicCandidateGenerator();
    const input = {
        ownerProfile: profile(),
        recentArtifacts: [{ title: 'AI' }]
    };
    const first = generator.generate(input);
    const second = generator.generate(input);

    assert.equal(first.excluded_recent_count, 1);
    assert.equal(first.candidates.some((item) => item.topic_seed === 'AI' && item.candidate_type !== 'activity_seed'), false);
    assert.deepEqual(first.candidates.map((item) => item.id), second.candidates.map((item) => item.id));
});

test('does not promote generated recommendation artifacts into activity candidates', () => {
    const result = createTopicCandidateGenerator().generate({
        ownerProfile: profile(),
        recentArtifacts: [{ id: 'artifact-1', title: '최근 작성한 글감', artifact_type: 'content_idea' }]
    });

    const activity = result.candidates.find((item) => item.candidate_type === 'activity_seed');
    assert.equal(activity, undefined);
});

test('adds recent writing activity as an explicit candidate source', () => {
    const result = createTopicCandidateGenerator().generate({
        ownerProfile: {
            ...profile(),
            activity: {
                recent_subjects: [{ subject: '최근 작성한 여행 정리', domain: 'blog', stage: 'published' }]
            }
        }
    });

    const activity = result.candidates.find((item) => item.candidate_type === 'activity_seed');
    assert.equal(activity.topic_seed, '최근 작성한 여행 정리');
    assert.equal(activity.source_refs[0].kind, 'activity');
});

test('does not use generated activity signals but keeps selected writing activity', () => {
    const result = createTopicCandidateGenerator().generate({
        ownerProfile: {
            ...profile(),
            activity: {
                recent_subjects: [
                    { subject: '단순 추천 결과', domain: 'blog', stage: 'generated' },
                    { subject: '사용자가 선택한 글감', domain: 'blog', stage: 'selected' }
                ]
            }
        }
    });

    assert.equal(result.candidates.some((item) => item.topic_seed === '단순 추천 결과'), false);
    assert.equal(result.candidates.some((item) => item.topic_seed === '사용자가 선택한 글감'), true);
});

test('excludes candidate ids that were recommended in previous runs', () => {
    const generator = createTopicCandidateGenerator();
    const initial = generator.generate({
        ownerProfile: profile(),
        knowledge: [{
            provider_id: 'naver-trends',
            kind: 'trends',
            items: [{ title: 'AI 블로그 도구' }]
        }]
    });
    const previousId = initial.candidates.find((item) => item.topic_seed === 'AI 블로그 도구').id;
    const result = generator.generate({
        ownerProfile: profile(),
        excludedCandidateIds: [previousId],
        knowledge: [{
            provider_id: 'naver-trends',
            kind: 'trends',
            items: [{ title: 'AI 블로그 도구' }]
        }]
    });

    assert.equal(result.candidates.some((item) => item.id === previousId), false);
    assert.equal(result.excluded_previous_count, 1);
});

test('uses a topic hint to prioritize matching graph-derived profile and activity signals', () => {
    const result = createTopicCandidateGenerator().generate({
        query: '워드프레스',
        ownerProfile: {
            ...profile(),
            activity: {
                recent_subjects: [
                    { subject: '워드프레스 블로그 운영 기록', domain: 'blog', stage: 'published' },
                    { subject: '주말 오사카 여행 계획', domain: 'blog', stage: 'published' }
                ]
            }
        }
    });

    assert.equal(result.focus.matched_profile_keyword_count, 1);
    assert.equal(result.focus.matched_activity_count, 1);
    assert.equal(result.candidates.some((item) => item.candidate_type === 'request_seed' && item.topic_seed === '워드프레스'), true);
    const request = result.candidates.find((item) => item.candidate_type === 'request_seed');
    assert.equal(request.owner_matches.keywords[0].value, '워드프레스');
    assert.equal(result.candidates.some((item) => item.candidate_type === 'activity_seed' && item.topic_seed === '워드프레스 블로그 운영 기록'), true);
    assert.equal(result.candidates.some((item) => item.topic_seed === '주말 오사카 여행 계획'), false);
});
