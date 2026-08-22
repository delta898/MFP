const test = require('node:test');
const assert = require('node:assert/strict');
const {
    RECOMMENDATION_SCHEMA_VERSION,
    RECOMMENDATION_KINDS,
    RECOMMENDATION_STATES,
    RECOMMENDATION_EVENT_TYPES,
    normalizeRecommendationCandidate,
    normalizeRecommendation,
    toPublicRecommendationDto
} = require('./contract');
const { createCandidate, createRecommendation } = require('./test-fixtures');

test('exposes the canonical recommendation vocabulary', () => {
    assert.equal(RECOMMENDATION_SCHEMA_VERSION, 1);
    assert.deepEqual(RECOMMENDATION_KINDS, [
        'content_opportunity',
        'commerce_opportunity',
        'setup_guidance',
        'recovery_action',
        'workflow_hint'
    ]);
    assert.equal(RECOMMENDATION_STATES.includes('action_failed'), true);
    assert.equal(RECOMMENDATION_EVENT_TYPES.includes('recommendation.action_completed'), true);
});

test('normalizes a candidate without assigning policy or lifecycle state', () => {
    const candidate = normalizeRecommendationCandidate(createCandidate());
    assert.equal(candidate.schema_version, 1);
    assert.equal(candidate.title, 'AI 글쓰기 정책 변화');
    assert.equal(candidate.evidence[0].source_ref.label, 'Example News');
    assert.equal(candidate.handoff.type, 'capability');
    assert.equal(Object.hasOwn(candidate, 'score'), false);
    assert.equal(Object.hasOwn(candidate, 'status'), false);
});

test('normalizes the materialized recommendation layers independently', () => {
    const recommendation = normalizeRecommendation(createRecommendation());
    assert.equal(recommendation.candidate.candidate_id, 'candidate:news:ai-writing');
    assert.equal(recommendation.policy.policy_id, 'proactive-guidance-ranking-v1');
    assert.equal(recommendation.policy.score, 0.82);
    assert.equal(recommendation.status, 'available');
});

test('builds a public DTO without owner, policy, dedupe, capability params, or evidence features', () => {
    const dto = toPublicRecommendationDto(createRecommendation());
    assert.equal(dto.recommendation_id, 'recommendation:news:ai-writing:2026-08-23');
    assert.equal(dto.action.type, 'capability');
    assert.equal(dto.action.label, '글감 만들기');
    assert.equal(dto.evidence[0].source.url, 'https://example.com/news/1');
    assert.equal(Object.hasOwn(dto, 'owner_user_id'), false);
    assert.equal(Object.hasOwn(dto, 'policy'), false);
    assert.equal(Object.hasOwn(dto, 'dedupe_key'), false);
    assert.equal(Object.hasOwn(dto.action, 'capability_id'), false);
    assert.equal(Object.hasOwn(dto.action, 'params'), false);
    assert.equal(Object.hasOwn(dto.evidence[0], 'features'), false);
});

test('keeps allowlisted presentation handoff data available to the UI', () => {
    const recommendation = createRecommendation({
        candidate: createCandidate({
            handoff: {
                type: 'presentation',
                label: '빠른 포스팅 열기',
                target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
                payload: { subject: 'AI 글쓰기 정책', keywords: ['AI 글쓰기'] }
            }
        })
    });
    const dto = toPublicRecommendationDto(recommendation);
    assert.deepEqual(dto.action, {
        type: 'presentation',
        label: '빠른 포스팅 열기',
        target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
        payload: { subject: 'AI 글쓰기 정책', keywords: ['AI 글쓰기'] }
    });
});

test('defensively removes sensitive presentation payload keys from the public DTO', () => {
    const recommendation = createRecommendation({
        candidate: createCandidate({
            handoff: {
                type: 'presentation',
                label: '설정 열기',
                target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                payload: { section: 'wordpress', api_key: 'must-not-leak' }
            }
        })
    });
    const dto = toPublicRecommendationDto(recommendation);
    assert.deepEqual(dto.action.payload, { section: 'wordpress' });
});
