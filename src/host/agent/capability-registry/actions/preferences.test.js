const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentPreferenceCapabilities } = require('./preferences');

test('preference summary returns recorded values with evidence and has an empty state', async () => {
    const [capability] = createAgentPreferenceCapabilities();
    const context = {
        memory: {
            preferences: [{ name: 'writing.tone', value: '친근한 설명체', confidence: 0.82, evidence_count: 4 }]
        }
    };

    assert.deepEqual(await capability.validate({}), { ok: true, errors: [], normalizedParams: {} });
    assert.equal((await capability.preview({}, context)).before.preference_count, 1);
    const result = await capability.execute({}, context);
    assert.equal(result.success, true);
    assert.deepEqual(result.data.preferences, context.memory.preferences);
    assert.match(result.message, /writing\.tone.*confidence=0\.82, evidence=4/);
    assert.deepEqual(result.sideEffects, []);

    const empty = await capability.execute({}, {});
    assert.deepEqual(empty.data.preferences, []);
    assert.match(empty.message, /충분하지 않습니다/);
});
