const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendationProducerRunner } = require('./runtime');
const { createSetupGuidanceProducer } = require('./setup-guidance');
const { createJobRecoveryProducer } = require('./job-recovery');
const { createPendingWorkflowProducer } = require('./pending-workflow');

test('common runtime executes three operational producers independently', async () => {
    const state = {
        owner_user_id: 'owner-local', observed_at: '2026-08-24T03:00:00.000Z',
        readiness: {
            config_ready: true, essential_configured: true, google_sheets_configured: true,
            naver_blog_configured: true, wordpress_configured: false
        },
        jobs: [{
            id: 'job-1', job_name: 'jobs.blog.publish', status: 'failed',
            started_at: '2026-08-24T02:00:00.000Z', finished_at: '2026-08-24T02:01:00.000Z'
        }],
        pending_confirmations: [{ id: 'confirmation-1', status: 'pending', created_at: '2026-08-24T02:30:00.000Z' }]
    };
    const runner = createRecommendationProducerRunner({
        runIdFactory: () => 'producer_run:operational',
        producers: [
            createSetupGuidanceProducer(),
            createJobRecoveryProducer(),
            createPendingWorkflowProducer()
        ]
    });
    const result = await runner.run({ owner_user_id: 'owner-local', operational_state: state });
    assert.deepEqual(result.candidates.map((item) => item.kind), [
        'setup_guidance', 'recovery_action', 'workflow_hint'
    ]);
    assert.deepEqual(result.diagnostics.failed, []);
    assert.deepEqual(result.diagnostics.invalid, []);
});
