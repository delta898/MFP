const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createJobRecoveryProducer, unresolvedFailures } = require('./job-recovery');

const NOW = '2026-08-24T03:00:00.000Z';

function job(id, name, status, finishedAt) {
    return { id, job_name: name, status, started_at: finishedAt, finished_at: finishedAt };
}

test('newer success resolves an older failure for the same job name', () => {
    const failures = unresolvedFailures([
        job('job-old', 'jobs.trends.run_collect', 'failed', '2026-08-24T01:00:00.000Z'),
        job('job-new', 'jobs.trends.run_collect', 'completed', '2026-08-24T02:00:00.000Z'),
        job('job-other', 'jobs.blog.publish', 'failed', '2026-08-24T02:30:00.000Z')
    ], NOW);
    assert.deepEqual(failures.map((item) => item.id), ['job-other']);
});

test('recovery producer excludes old and future failures and emits valid log navigation', async () => {
    const producer = createJobRecoveryProducer();
    const result = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: {
            owner_user_id: 'owner-local', observed_at: NOW,
            jobs: [
                job('job-current', 'jobs.blog.publish', 'failed', '2026-08-24T02:30:00.000Z'),
                job('job-old', 'jobs.trends.run_collect', 'failed', '2026-08-20T00:00:00.000Z'),
                job('job-future', 'jobs.sns.publish', 'failed', '2026-08-25T00:00:00.000Z')
            ]
        }
    });
    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.equal(candidate.metadata.job_name, 'jobs.blog.publish');
    assert.equal(candidate.handoff.target.surface, 'logs.system');
    assert.deepEqual(validateRecommendationCandidate(candidate).errors, []);
    assert.equal(Object.hasOwn(candidate.metadata, 'result'), false);
});

test('recovery candidate never copies job result or exception text', async () => {
    const state = {
        owner_user_id: 'owner-local', observed_at: NOW,
        jobs: [{
            ...job('job-1', 'jobs.trends.run_collect', 'failed', '2026-08-24T02:00:00.000Z'),
            result: { raw_response: 'must-not-escape', authorization: 'hidden' }
        }]
    };
    const result = await createJobRecoveryProducer().produce({ owner_user_id: 'owner-local', operational_state: state });
    assert.doesNotMatch(JSON.stringify(result), /raw_response|authorization|must-not-escape|hidden/);
});
