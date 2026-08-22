const test = require('node:test');
const assert = require('node:assert/strict');
const { toPublicRecommendationDto } = require('./contract');
const {
    validateRecommendationCandidate,
    validateRecommendationPolicyDecision,
    validateRecommendation
} = require('./validators');
const { createCandidate, createRecommendation } = require('./test-fixtures');

test('accepts a grounded candidate and materialized recommendation', () => {
    const candidate = validateRecommendationCandidate(createCandidate());
    const recommendation = validateRecommendation(createRecommendation());
    assert.deepEqual(candidate.errors, []);
    assert.equal(candidate.ok, true);
    assert.deepEqual(recommendation.errors, []);
    assert.equal(recommendation.ok, true);
    assert.equal(toPublicRecommendationDto(recommendation.value).kind, 'content_opportunity');
});

test('rejects unsupported kinds, missing evidence, and invalid opportunity time windows', () => {
    const result = validateRecommendationCandidate(createCandidate({
        kind: 'news',
        evidence: [],
        created_at: '2026-08-24T00:00:00.000Z',
        expires_at: '2026-08-23T00:00:00.000Z'
    }));
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('kind')), true);
    assert.equal(result.errors.some((error) => error.includes('evidence')), true);
    assert.equal(result.errors.some((error) => error.includes('created_at 이후')), true);
});

test('keeps external knowledge as observed weak evidence with provider provenance', () => {
    const candidate = createCandidate();
    candidate.evidence[0] = {
        ...candidate.evidence[0],
        stage: 'selected',
        strength: 'strong',
        source_ref: { kind: 'knowledge', id: 'news-item-1' }
    };
    const result = validateRecommendationCandidate(candidate);
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('observed / weak')), true);
    assert.equal(result.errors.some((error) => error.includes('provider provenance')), true);
});

test('rejects secrets and raw provider responses from metadata, evidence, and capability params', () => {
    const candidate = createCandidate({
        metadata: { api_key: 'must-not-persist' },
        handoff: {
            type: 'capability',
            label: '글감 만들기',
            capability_id: 'content.idea.suggest',
            params: { authorization: 'must-not-persist' },
            intent: '글감 만들기'
        }
    });
    candidate.evidence[0].features = { raw_response: { title: 'vendor payload' } };
    const result = validateRecommendationCandidate(candidate);
    assert.equal(result.ok, false);
    assert.equal(result.errors.filter((error) => error.includes('secret 또는 raw provider data')).length, 3);
});

test('rejects unknown fields and oversized raw data before normalization can truncate them', () => {
    const candidate = createCandidate({
        vendor_response: { hidden: true },
        metadata: { values: Array.from({ length: 21 }, (_, index) => index) }
    });
    candidate.evidence[0].source_ref.raw_payload = { hidden: true };
    const result = validateRecommendationCandidate(candidate);
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('candidate.vendor_response')), true);
    assert.equal(result.errors.some((error) => error.includes('metadata.values 배열은 20개 이하')), true);
    assert.equal(result.errors.some((error) => error.includes('source_ref.raw_payload')), true);
});

test('rejects unregistered or unsafe presentation targets', () => {
    const result = validateRecommendationCandidate(createCandidate({
        handoff: {
            type: 'presentation',
            label: '외부 화면 열기',
            target: {
                surface: 'external.browser',
                url: 'javascript:alert(1)',
                callback: 'runAnything'
            },
            payload: {}
        }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('등록되지 않은 화면')), true);
    assert.equal(result.errors.some((error) => error.includes('target.url')), true);
    assert.equal(result.errors.some((error) => error.includes('target.callback')), true);
});

test('rejects credentials embedded in evidence source URLs', () => {
    const candidate = createCandidate();
    candidate.evidence[0].source_ref.url = 'https://user:password@example.com/news/1?access_token=secret';
    const result = validateRecommendationCandidate(candidate);
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('url에는 credential')), true);
    assert.equal(result.errors.some((error) => error.includes('url query에는 credential')), true);
});

test('does not let a recommendation declare its own confirmation policy', () => {
    const result = validateRecommendationCandidate(createCandidate({
        handoff: {
            type: 'capability',
            label: '바로 발행',
            capability_id: 'content.publish.execute',
            params: {},
            intent: '콘텐츠 발행',
            requires_confirmation: false
        }
    }));
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('requires_confirmation')), true);
});

test('validates eligible and suppressed policy decisions separately', () => {
    const eligible = validateRecommendationPolicyDecision({
        policy_id: 'ranking-v1',
        policy_version: 1,
        eligible: true,
        score: 0.75,
        rank: 1,
        breakdown: {},
        decided_at: '2026-08-23T01:00:00.000Z'
    });
    const suppressed = validateRecommendationPolicyDecision({
        policy_id: 'ranking-v1',
        policy_version: 1,
        eligible: false,
        score: 0.1,
        rank: 0,
        suppression_reasons: ['cooldown'],
        breakdown: {},
        decided_at: '2026-08-23T01:00:00.000Z'
    });
    assert.equal(eligible.ok, true);
    assert.equal(suppressed.ok, true);

    const invalid = validateRecommendationPolicyDecision({
        policy_id: 'ranking-v1',
        policy_version: 1,
        eligible: false,
        score: 4,
        rank: 2,
        decided_at: 'invalid'
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.errors.length >= 4, true);
});

test('requires owner consistency and snooze invariants for materialized recommendations', () => {
    const result = validateRecommendation(createRecommendation({
        owner_user_id: 'another-owner',
        status: 'snoozed',
        snoozed_until: null
    }));
    assert.equal(result.ok, false);
    assert.equal(result.errors.some((error) => error.includes('candidate owner')), true);
    assert.equal(result.errors.some((error) => error.includes('snoozed_until')), true);
});

test('can represent legacy workflow and grounded topic fixtures without historic backfill', () => {
    const legacyWorkflow = validateRecommendationCandidate(createCandidate({
        candidate_id: 'legacy-suggestion:pending-confirmations',
        kind: 'workflow_hint',
        producer_id: 'legacy-suggestion-adapter-v1',
        title: '확인 대기 요청이 있습니다',
        summary: '기존 generic suggestion을 호환 후보로 표현합니다.',
        explanation: '기존 pending confirmation 사실에서 생성되었습니다.',
        evidence: [{
            evidence_id: 'legacy-event:confirmation-1',
            kind: 'system_state',
            stage: 'observed',
            strength: 'weak',
            summary: '확인 대기 요청 1건',
            observed_at: '2026-08-23T00:00:00.000Z',
            source_ref: { kind: 'event', id: 'confirmation-1' },
            features: {}
        }],
        handoff: null,
        dedupe_key: 'workflow:pending-confirmations',
        created_at: '2026-08-23T00:00:00.000Z',
        expires_at: '2026-08-24T00:00:00.000Z'
    }));
    const topicRecommendation = validateRecommendationCandidate(createCandidate({
        candidate_id: 'topic_candidate_abc123',
        producer_id: 'topic-recommendation-adapter-v1',
        evidence: [{
            evidence_id: 'artifact:topic-1',
            kind: 'owner_activity',
            stage: 'published',
            strength: 'strong',
            summary: '관련 주제를 이전에 발행함',
            observed_at: '2026-08-20T00:00:00.000Z',
            source_ref: { kind: 'artifact', id: 'topic-1' },
            features: { evidence_count: 1 }
        }]
    }));
    assert.equal(legacyWorkflow.ok, true);
    assert.equal(topicRecommendation.ok, true);
});
