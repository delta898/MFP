const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createPolicyContextCollector,
    sanitizeQuotaState,
    sanitizeRecommendationHistory
} = require('./context');

const NOW = '2026-08-24T09:00:00.000Z';

function licenseFeatures(overrides = {}) {
    return {
        cmd_batch: true,
        cmd_trends: true,
        cmd_shopping: true,
        enable_related_posts_auto_link: true,
        enable_sns_distribution: false,
        ...overrides
    };
}

function historyRecord(overrides = {}) {
    return {
        recommendation_id: 'rec-1', owner_user_id: 'owner-local', status: 'dismissed',
        available_at: '2026-08-23T08:00:00.000Z', expires_at: '2026-08-25T08:00:00.000Z',
        last_event_at: '2026-08-24T08:00:00.000Z',
        candidate: { kind: 'content_opportunity', dedupe_key: 'content:one', evidence: [{ raw_response: 'hidden' }] },
        policy: { breakdown: { secret: 'hidden' } },
        ...overrides
    };
}

test('collects owner-scoped policy facts without config, capability, history or license payload leakage', async () => {
    const collector = createPolicyContextCollector({
        now: () => new Date(NOW),
        capabilityRegistry: {
            list() {
                return [
                    { id: 'content.topic.register', params: { api_key: 'must-not-escape' } },
                    { domain: 'content', name: 'publish.execute', execute: () => 'hidden' }
                ];
            }
        },
        recommendationStore: {
            getLocalOwnerIdentity() { return { owner_user_id: 'owner-local' }; },
            async listRecommendations(ownerId, options) {
                assert.equal(ownerId, 'owner-local');
                assert.equal(options.limit, 200);
                return [historyRecord(), historyRecord({ recommendation_id: 'foreign', owner_user_id: 'owner-other' })];
            }
        },
        async licenseFeatureReader() { return { ...licenseFeatures(), license_key: 'must-not-escape' }; },
        async settingReadinessReader() {
            return { config_ready: true, google_sheets_configured: true, password: 'must-not-escape' };
        },
        async quotaReader() {
            return { publishing: { known: true, remaining: 3, reservation_token: 'must-not-escape' } };
        }
    });
    const result = await collector.collect({ owner_user_id: 'owner-local' });

    assert.deepEqual(result.capabilities, {
        known: true,
        ids: ['content.publish.execute', 'content.topic.register']
    });
    assert.equal(result.license.features.cmd_shopping, true);
    assert.deepEqual(result.quota.publishing, { known: true, unlimited: false, remaining: 3 });
    assert.equal(result.history.items.length, 1);
    assert.deepEqual(Object.keys(result.history.items[0]), [
        'recommendation_id', 'kind', 'dedupe_key', 'status', 'available_at', 'expires_at', 'last_event_at'
    ]);
    assert.doesNotMatch(JSON.stringify(result), /must-not-escape|raw_response|reservation_token|license_key|password/);
});

test('source failures stay isolated as stable unknown facts and bounded diagnostics', async () => {
    const collector = createPolicyContextCollector({
        now: () => new Date(NOW),
        capabilityRegistry: { list() { throw new Error('raw capability failure'); } },
        recommendationStore: { async listRecommendations() { throw new Error('raw history failure'); } },
        async licenseFeatureReader() { throw new Error('secret license failure'); }
    });
    const result = await collector.collect({ owner_user_id: 'owner-local' });
    assert.equal(result.capabilities.known, false);
    assert.equal(result.license.known, false);
    assert.equal(result.settings.known, false);
    assert.equal(result.quota.publishing.known, false);
    assert.equal(result.history.known, false);
    assert.deepEqual(result.diagnostics.map((item) => item.code), [
        'CAPABILITY_READ_FAILED', 'SOURCE_UNAVAILABLE', 'SOURCE_UNAVAILABLE',
        'SOURCE_READ_FAILED', 'HISTORY_READ_FAILED'
    ]);
    assert.doesNotMatch(JSON.stringify(result), /raw capability|raw history|secret license/);
});

test('quota and history sanitizers reject ambiguous or foreign values', () => {
    assert.deepEqual(sanitizeQuotaState({ publishing: { known: true, unlimited: true, remaining: 'secret' } }), {
        publishing: { known: true, unlimited: true, remaining: 0 }
    });
    assert.equal(sanitizeQuotaState({ publishing: { known: true, remaining: 'unknown' } }).publishing.known, false);
    assert.deepEqual(sanitizeRecommendationHistory([
        historyRecord({ recommendation_id: 'bad id' }),
        historyRecord({ recommendation_id: 'foreign', owner_user_id: 'owner-other' })
    ], 'owner-local'), []);
});

test('conflicting owner identities produce an ownerless context instead of cross-owner reads', async () => {
    let historyReads = 0;
    const collector = createPolicyContextCollector({
        now: () => new Date(NOW),
        recommendationStore: {
            getLocalOwnerIdentity() { return { owner_user_id: 'owner-b' }; },
            async listRecommendations() { historyReads += 1; return []; }
        }
    });
    const result = await collector.collect({ owner_user_id: 'owner-a' });
    assert.equal(result.owner_user_id, '');
    assert.equal(historyReads, 0);
});
