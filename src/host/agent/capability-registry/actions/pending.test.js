const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentPendingCapabilities } = require('./pending');

test('pending query previews and returns confirmation summaries without side effects', async () => {
    const [capability] = createAgentPendingCapabilities();
    const context = {
        memory: {
            pending_confirmations: [{ id: 'confirm-1', previews: [{ preview: { summary: '글감 저장을 확인해 주세요.' } }] }]
        }
    };
    const preview = await capability.preview({}, context);
    assert.deepEqual(preview.before, { pending_count: 1 });
    const result = await capability.execute({}, context);
    assert.match(result.message, /1건입니다/);
    assert.match(result.message, /글감 저장/);
    assert.deepEqual(result.data.pending, context.memory.pending_confirmations);
    assert.deepEqual(result.sideEffects, []);

    const empty = await capability.execute({}, {});
    assert.deepEqual(empty.data.pending, []);
    assert.match(empty.message, /없습니다/);
});
