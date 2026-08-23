const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequirementRegistry } = require('./requirements');
const { evaluateCandidateEligibility } = require('./eligibility');

const NOW = '2026-08-24T09:00:00.000Z';

function candidate(overrides = {}) {
    return {
        candidate_id: 'candidate:policy:1', kind: 'content_opportunity', producer_id: 'content-opportunity-v1',
        owner_user_id: 'owner-local', title: '정책 후보', summary: '정책 후보 요약', explanation: '검증된 근거 설명',
        evidence: [{
            evidence_id: 'evidence:policy:1', kind: 'owner_activity', stage: 'saved', strength: 'medium',
            summary: '사용자가 저장한 주제입니다.', observed_at: '2026-08-24T08:00:00.000Z', expires_at: null,
            source_ref: { kind: 'artifact', id: 'topic:1', label: '저장 주제', provider_id: '', transport: '', url: '', timestamp: '2026-08-24T08:00:00.000Z' },
            features: {}
        }],
        handoff: null, dedupe_key: 'content:policy:1', created_at: '2026-08-24T08:30:00.000Z',
        expires_at: '2026-08-25T09:00:00.000Z', metadata: {}, ...overrides
    };
}

function context(overrides = {}) {
    return {
        owner_user_id: 'owner-local', observed_at: NOW,
        capabilities: { known: true, ids: ['content.topic.register'] },
        presentation: { known: true, surfaces: ['settings.general', 'logs.system'] },
        license: { known: true, features: { cmd_shopping: true } },
        settings: { known: true, values: { google_sheets_configured: true } },
        quota: { publishing: { known: true, unlimited: false, remaining: 1 } },
        history: { known: true, items: [] },
        ...overrides
    };
}

test('ordinary content remains eligible without License or quota requirements', () => {
    const result = evaluateCandidateEligibility(candidate(), context({
        license: { known: false, features: {} },
        quota: { publishing: { known: false, unlimited: false, remaining: 0 } }
    }));
    assert.equal(result.eligible, true);
    assert.deepEqual(result.suppression_reasons, []);
});

test('commerce fails closed for unknown or disabled shopping entitlement', () => {
    const commerce = candidate({ kind: 'commerce_opportunity', producer_id: 'commerce-opportunity-v1' });
    const unknown = evaluateCandidateEligibility(commerce, context({ license: { known: false, features: {} } }));
    const disabled = evaluateCandidateEligibility(commerce, context({ license: { known: true, features: { cmd_shopping: false } } }));
    const enabled = evaluateCandidateEligibility(commerce, context());
    assert.deepEqual(unknown.suppression_reasons, ['license_context_unknown']);
    assert.deepEqual(disabled.suppression_reasons, ['license_feature_disabled:cmd_shopping']);
    assert.equal(enabled.eligible, true);
});

test('server-owned setting and quota requirements fail closed without trusting metadata', () => {
    const registry = createRequirementRegistry({ rules: [{
        producer_id: 'content-opportunity-v1', setting_keys: ['google_sheets_configured'], quota_class: 'publishing'
    }] });
    const blocked = evaluateCandidateEligibility(candidate({
        metadata: { setting_keys: [], quota_class: '' }
    }), context({
        settings: { known: true, values: { google_sheets_configured: false } },
        quota: { publishing: { known: true, unlimited: false, remaining: 0 } }
    }), { requirementRegistry: registry });
    assert.deepEqual(blocked.suppression_reasons, [
        'setting_unready:google_sheets_configured', 'quota_exhausted:publishing'
    ]);
});

test('intrinsic presentation and capability handoffs require registered targets', () => {
    const presentation = candidate({
        handoff: { type: 'presentation', label: '설정 보기', target: { surface: 'settings.general', view: 'settings', tab: 'general' }, payload: {} }
    });
    const capability = candidate({
        handoff: { type: 'capability', label: '글감 저장', capability_id: 'content.topic.register', params: {}, intent: '글감 저장' }
    });
    assert.equal(evaluateCandidateEligibility(presentation, context()).eligible, true);
    assert.equal(evaluateCandidateEligibility(capability, context()).eligible, true);
    assert.deepEqual(evaluateCandidateEligibility(presentation, context({
        presentation: { known: true, surfaces: [] }
    })).suppression_reasons, ['presentation_unavailable:settings.general']);
    assert.deepEqual(evaluateCandidateEligibility(capability, context({
        capabilities: { known: true, ids: [] }
    })).suppression_reasons, ['capability_unavailable:content.topic.register']);
});

test('owner, future time, expiry and unavailable history are independent blockers', () => {
    const future = evaluateCandidateEligibility(candidate({
        owner_user_id: 'owner-other', created_at: '2026-08-24T10:00:00.000Z', expires_at: '2026-08-25T10:00:00.000Z'
    }), context({ history: { known: false, items: [] } }));
    const expired = evaluateCandidateEligibility(candidate({
        created_at: '2026-08-23T08:00:00.000Z', expires_at: '2026-08-24T08:59:59.000Z'
    }), context());
    assert.deepEqual(future.suppression_reasons, [
        'owner_mismatch', 'candidate_created_in_future', 'recommendation_history_unknown'
    ]);
    assert.deepEqual(expired.suppression_reasons, ['candidate_expired']);
});

test('active duplicate, dismissed seven-day and completed fourteen-day cooldowns use exact dedupe', () => {
    function history(status, lastEventAt, expiresAt = '2026-08-25T09:00:00.000Z') {
        return {
            recommendation_id: `rec-${status}`, kind: 'content_opportunity', dedupe_key: 'content:policy:1',
            status, available_at: '2026-08-20T09:00:00.000Z', expires_at: expiresAt, last_event_at: lastEventAt
        };
    }
    const active = evaluateCandidateEligibility(candidate(), context({
        history: { known: true, items: [history('available', '2026-08-24T08:00:00.000Z')] }
    }));
    const dismissed = evaluateCandidateEligibility(candidate(), context({
        history: { known: true, items: [history('dismissed', '2026-08-18T09:00:01.000Z')] }
    }));
    const completedBoundary = evaluateCandidateEligibility(candidate(), context({
        history: { known: true, items: [history('action_completed', '2026-08-10T09:00:00.000Z')] }
    }));
    assert.deepEqual(active.suppression_reasons, ['active_duplicate']);
    assert.deepEqual(dismissed.suppression_reasons, ['cooldown:dismissed']);
    assert.equal(completedBoundary.eligible, true);
});

test('invalid candidates return only bounded identity and stable reason', () => {
    const result = evaluateCandidateEligibility({ candidate_id: 'bad candidate', api_key: 'must-not-escape' }, context());
    assert.deepEqual(result, {
        candidate_id: 'bad candidate', eligible: false, suppression_reasons: ['candidate_invalid'],
        requirements: null, matched_history: []
    });
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
});
