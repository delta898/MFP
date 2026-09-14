const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SQLiteEventStore } = require('./sqlite-event-store');
const { createMemoryRetrievalService } = require('./retrieval-service');

test('owner JobRun query follows owned event relations and never returns result_json', async () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-owner-jobs-'));
    const store = new SQLiteEventStore({ baseDir, Logger: { warn() {} } });
    try {
        await store.initialize();
        const owner = store.getLocalOwnerIdentity().owner_user_id;
        await store.appendEvent({
            event_type: 'capability.completed',
            owner_user_id: owner,
            actor_type: 'system',
            actor_id: 'SYSTEM',
            timestamp: '2026-08-24T00:00:00.000Z',
            payload: {
                action: { id: 'action:job-1', type: 'job.run', domain: 'jobs.trends', name: 'run_collect' },
                result: { success: false, data: { api_key: 'must-not-escape' } }
            }
        });
        const jobs = await store.listOwnerJobRuns(owner, { limit: 10 });
        assert.equal(jobs.length, 1);
        assert.equal(jobs[0].job_name, 'jobs.trends.run_collect');
        assert.equal(jobs[0].status, 'failed');
        assert.doesNotMatch(JSON.stringify(jobs), /must-not-escape|result_json/);
    } finally {
        store.close();
        fs.rmSync(baseDir, { recursive: true, force: true });
    }
});

test('memory context prefers owner-scoped JobRuns over conversation fallback', async () => {
    const calls = [];
    const eventStore = {
        getLocalOwnerIdentity() { return { owner_user_id: 'owner-local' }; },
        async listRecentJobRuns() {
            return [{ id: 'conversation-job', job_name: 'old', status: 'failed', result: { secret: true } }];
        },
        async listOwnerJobRuns(ownerUserId) {
            calls.push(ownerUserId);
            return [{ id: 'owner-job', job_name: 'jobs.trends.run_collect', status: 'completed' }];
        },
        async getOwnerActivitySignalSummary() { return null; },
        async getOwnerTopicSemanticSummary() { return null; },
        async listOwnerArtifacts() { return []; }
    };
    const service = createMemoryRetrievalService({ eventStore });
    const packet = await service.buildContextPacket({ conversationId: 'conversation-1', owner_user_id: 'owner-local' });

    assert.deepEqual(calls, ['owner-local']);
    assert.deepEqual(packet.recent_job_runs, [{
        id: 'owner-job', job_name: 'jobs.trends.run_collect', status: 'completed'
    }]);
});
