const test = require('node:test');
const assert = require('node:assert/strict');
const { KuzuEventStore } = require('./event-store');
const { createMemoryRetrievalService } = require('./retrieval-service');

function resultRows(rows) {
    let index = 0;
    return {
        hasNext() { return index < rows.length; },
        async getNext() { return rows[index++]; }
    };
}

test('owner JobRun query follows owned events and never returns result_json', async () => {
    const store = new KuzuEventStore({ Logger: { warn() {} } });
    store.initialize = async () => true;
    let captured = null;
    store._runQuery = async (query, params) => {
        captured = { query, params };
        return resultRows([{
            id: 'job-1', job_name: 'jobs.trends.run_collect', status: 'failed',
            started_at: '2026-08-24T00:00:00.000Z', finished_at: '2026-08-24T00:01:00.000Z',
            result_json: '{"api_key":"must-not-escape"}'
        }]);
    };

    const jobs = await store.listOwnerJobRuns('owner-local', { limit: 10 });
    assert.match(captured.query, /OwnerOWNS_EVENT/);
    assert.match(captured.query, /ActionTRIGGERED_JOB/);
    assert.doesNotMatch(captured.query, /result_json/);
    assert.deepEqual(captured.params, { owner_id: 'owner-local', limit: 10 });
    assert.deepEqual(jobs, [{
        id: 'job-1', job_name: 'jobs.trends.run_collect', status: 'failed',
        started_at: '2026-08-24T00:00:00.000Z', finished_at: '2026-08-24T00:01:00.000Z'
    }]);
    assert.doesNotMatch(JSON.stringify(jobs), /must-not-escape/);
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
