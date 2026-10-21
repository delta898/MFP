const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRetrievalService } = require('./retrieval-service');

test('memory context separates user-authored rules from inferred preferences', async () => {
    const service = createMemoryRetrievalService({
        eventStore: {
            async listConversationEvents() { return []; },
            async listRecentMessages() { return []; },
            async listRecentActions() { return []; },
            async listRecentSettingChanges() { return []; },
            async listRecentJobRuns() { return []; },
            async listRecentArtifacts() { return []; },
            async listUserPreferences() { return [{ name: 'writing.tone', value: { value: 'concise' }, confidence: 0.8, evidence_count: 4 }]; },
            async listUserCommandRules(userId, options) {
                assert.equal(userId, 'telegram-user');
                assert.equal(options.activeOnly, true);
                return [{ id: 'rule-1', trigger: '[ideas]', status: 'active', action_id: 'content.idea.suggest' }];
            },
            getLocalOwnerIdentity() { return null; }
        }
    });

    const packet = await service.buildContextPacket({ conversationId: 'telegram:telegram-user', userId: 'telegram-user' });
    assert.equal(packet.preferences[0].name, 'writing.tone');
    assert.equal(packet.user_rules[0].trigger, '[ideas]');
});
