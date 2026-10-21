const test = require('node:test');
const assert = require('node:assert/strict');
const { createCapabilityRuntime } = require('./capability-runtime');
const GoogleSheets = require('../adapters/storage/google-sheets/operations');

function createDependencies(appendGoogleSheetTopics, googleSheetsOverrides = {}) {
    return {
        modelConfiguration: { resolveChatModelSettings: () => ({ resolved: {}, source: 'writing' }) },
        keywordResearchApplication: { analyze: async () => ({}) },
        GoogleSheets: {
            appendGoogleSheetTopics,
            async readGoogleSheetTopicsAll() { return { items: [] }; },
            async updateGoogleSheetStatus() {},
            async updateGoogleSheetTopicEditableFields() {},
            clearSheetCache() {},
            ...googleSheetsOverrides
        },
        ensureSheetsReadyForUi: async () => {}
    };
}

test('capability composition exposes topic saving through Blog Queue Management Application', async () => {
    let appendedRows;
    let appendedOptions;
    const capabilityRegistry = createCapabilityRuntime(createDependencies(async (rows, options) => {
        appendedRows = rows;
        appendedOptions = options;
        return { success: true, rowIndices: [7], rowNumbers: [9] };
    }));

    const action = capabilityRegistry.getAgentAction('content.register_topic.execute');
    assert.ok(action);
    assert.equal(action.effect, 'external_side_effect');
    assert.equal(action.confirmPolicy, 'required');
    assert.equal((await capabilityRegistry.validateAction({
        action_id: 'content.register_topic.execute', params: { theme: '가을 여행' }
    })).ok, false);
    assert.equal((await capabilityRegistry.validateAction({
        action_id: 'content.register_topic.execute', params: { theme: '가을 여행', action: 'enqueue' }
    })).ok, false);

    const result = await capabilityRegistry.executeAction({
        action_id: 'content.register_topic.execute',
        params: { theme: '가을 여행', action: 'save', keywords: ['가을 여행'] }
    }, { channel: 'telegram', user: { id: 'chat-1' } });

    assert.equal(result.data.status, '대기');
    assert.deepEqual(result.data.rowIndices, [7]);
    assert.equal(appendedRows[0].subject, '가을 여행');
    assert.equal(appendedOptions.defaultStatus, '대기');
    assert.equal(typeof appendedOptions.memoryProvenance, 'object');
});

test('capability composition does not advertise topic persistence without its application dependency', () => {
    const capabilityRegistry = createCapabilityRuntime({
        modelConfiguration: { resolveChatModelSettings: () => ({ resolved: {}, source: 'writing' }) },
        keywordResearchApplication: { analyze: async () => ({}) }
    });

    assert.equal(capabilityRegistry.getAgentAction('content.register_topic.execute'), null);
});

test('real Google Sheets adapter composes the topic persistence action', async () => {
    const capabilityRegistry = createCapabilityRuntime({
        modelConfiguration: { resolveChatModelSettings: () => ({ resolved: {}, source: 'writing' }) },
        keywordResearchApplication: { analyze: async () => ({}) },
        GoogleSheets
    });

    assert.equal(typeof GoogleSheets.appendGoogleSheetTopics, 'function');
    assert.ok(capabilityRegistry.getAgentAction('content.register_topic.execute'));
    assert.equal(capabilityRegistry.getAgentAction('content.register_topic.prepare'), null);
    assert.ok(capabilityRegistry.getAgentAction('content.queue.list_topics'));
    assert.ok(capabilityRegistry.getAgentAction('content.queue.move_topic'));
    assert.ok(capabilityRegistry.getAgentAction('content.queue.update_topic'));
    assert.equal((await capabilityRegistry.validateAction({
        action_id: 'content.queue.update_topic',
        params: { subject: '가을 여행', platforms: ['wordpress'] }
    })).ok, true);
    assert.equal((await capabilityRegistry.validateAction({
        action_id: 'content.queue.update_topic',
        params: { subject: '가을 여행', platforms: ['naver', 'wordpress'] }
    })).ok, false);
});

test('composed queue actions list Sheet topics and move the selected row through the Application', async () => {
    const topics = [
        { rowIndex: 11, rowNumber: 13, subject: '가을 여행', status: '발행 준비 완료', keywords: ['오사카 여행'] }
    ];
    const statusUpdates = [];
    const capabilityRegistry = createCapabilityRuntime(createDependencies(async () => ({ success: true }), {
        async readGoogleSheetTopicsAll({ status } = {}) {
            const items = status ? topics.filter((topic) => topic.status === status) : topics;
            return { items: items.map((item) => ({ ...item })) };
        },
        async updateGoogleSheetStatus(rowIndex, status, reason, options) {
            statusUpdates.push({ rowIndex, status, reason, options });
            topics.find((topic) => topic.rowIndex === rowIndex).status = status;
            return { success: true };
        }
    }));

    const listed = await capabilityRegistry.executeAction({
        action_id: 'content.queue.list_topics', params: { scope: 'queue', limit: 10 }
    });
    const moved = await capabilityRegistry.executeAction({
        action_id: 'content.queue.move_topic',
        params: { subject: '가을 여행', source: 'queue', destination: 'saved' }
    });

    assert.match(listed.message, /가을 여행/);
    assert.equal(moved.data.rowNumber, 13);
    assert.equal(topics[0].status, '대기');
    assert.equal(statusUpdates[0].options.throwOnError, true);
});
