const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createOperationalStateCollector,
    resolveConfigReadiness,
    sanitizeJob
} = require('./operational-state-collector');

const NOW = '2026-08-24T03:00:00.000Z';

test('configuration readiness exposes booleans without copying config values', () => {
    const readiness = resolveConfigReadiness({
        CONFIG_READY: true,
        CONFIG_IS_ESSENTIAL_SET: false,
        CONFIG_IS_NAVER_SET: true,
        CONFIG_IS_WP_SET: false,
        GOOGLE_SHEET_URL: 'https://docs.google.com/secret-sheet',
        TEXT_MODEL_API_KEY: 'must-not-escape'
    });
    assert.deepEqual(readiness, {
        config_ready: true,
        essential_configured: false,
        google_sheets_configured: true,
        naver_blog_configured: true,
        wordpress_configured: false
    });
    assert.doesNotMatch(JSON.stringify(readiness), /secret-sheet|must-not-escape/);
});

test('collector prefers owner jobs and strips result and confirmation details', async () => {
    const collector = createOperationalStateCollector({
        now: () => new Date(NOW),
        config: {},
        eventStore: {
            async listOwnerJobRuns(ownerId) {
                assert.equal(ownerId, 'owner-local');
                return [{
                    id: 'job-1', job_name: 'jobs.trends.run_collect', status: 'failed',
                    started_at: '2026-08-24T01:00:00.000Z', finished_at: '2026-08-24T01:01:00.000Z',
                    result: { authorization: 'must-not-escape' }
                }];
            }
        }
    });
    const result = await collector.collect({ owner_user_id: 'owner-local' }, {
        memory: {
            recent_job_runs: [{ id: 'conversation-job', job_name: 'old', status: 'failed' }],
            pending_confirmations: [{
                id: 'confirmation-1', status: 'pending', createdAt: '2026-08-24T02:00:00.000Z',
                previews: [{ api_key: 'must-not-escape' }], plan: { params: { password: 'hidden' } }
            }]
        }
    });
    assert.equal(result.jobs[0].id, 'job-1');
    assert.deepEqual(result.pending_confirmations, [{
        id: 'confirmation-1', status: 'pending', created_at: '2026-08-24T02:00:00.000Z', updated_at: ''
    }]);
    assert.doesNotMatch(JSON.stringify(result), /authorization|api_key|password|must-not-escape/);
});

test('invalid job identities, statuses and timestamps are rejected', () => {
    assert.equal(sanitizeJob({ id: 'job 1', job_name: 'valid', status: 'failed', started_at: NOW }), null);
    assert.equal(sanitizeJob({ id: 'job-1', job_name: 'bad name', status: 'failed', started_at: NOW }), null);
    assert.equal(sanitizeJob({ id: 'job-1', job_name: 'valid', status: 'unknown', started_at: NOW }), null);
    assert.equal(sanitizeJob({ id: 'job-1', job_name: 'valid', status: 'failed' }), null);
});
