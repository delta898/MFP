const test = require('node:test');
const assert = require('node:assert/strict');

const { createAsyncJobStore } = require('./async-job-store');

function createMemoryFs() {
    const files = new Map();
    return {
        existsSync(filePath) {
            return files.has(filePath);
        },
        readFileSync(filePath) {
            return files.get(filePath);
        },
        mkdirSync() {},
        writeFileSync(filePath, value) {
            files.set(filePath, value);
        },
        renameSync(from, to) {
            files.set(to, files.get(from));
            files.delete(from);
        },
        files
    };
}

test('async job store atomically keeps operational data without prompts or keys', () => {
    const fsImpl = createMemoryFs();
    const store = createAsyncJobStore({
        filePath: '/data/async-ai-jobs.json',
        fsImpl,
        now: () => new Date('2026-07-31T10:00:00.000Z')
    });

    store.upsert({
        taskId: 'task-1',
        provider: 'kie',
        transport: 'kie_market_image_jobs',
        modelId: 'nano-banana-2',
        state: 'submitted',
        prompt: 'must not persist',
        api_key: 'must not persist'
    });
    store.upsert({ taskId: 'task-1', state: 'generating' });

    const saved = JSON.parse(fsImpl.files.get('/data/async-ai-jobs.json'));
    assert.equal(fsImpl.files.has('/data/async-ai-jobs.json.tmp'), false);
    assert.equal(saved.jobs.length, 1);
    assert.equal(saved.jobs[0].state, 'generating');
    assert.equal(saved.jobs[0].model_id, 'nano-banana-2');
    assert.equal('prompt' in saved.jobs[0], false);
    assert.equal('api_key' in saved.jobs[0], false);
});
