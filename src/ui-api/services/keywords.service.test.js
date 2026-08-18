const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordsService } = require('./keywords.service');

test('passes up to three selected title keywords to the keyword research service', async () => {
    let received = null;
    const service = createKeywordsService({
        keywordResearchService: {
            isConfigured: () => true,
            suggestTitles: async (input) => {
                received = input;
                return { success: true, titles: [] };
            }
        }
    });

    await service.suggestTitles({
        subject: '아이폰17 출시일과 스펙 변화',
        keywords: ['아이폰17', '애플 신제품', '아이폰 루머'],
        count: 3
    });

    assert.deepEqual(received.keywords, ['아이폰17', '애플 신제품', '아이폰 루머']);
    assert.equal(received.subject, '아이폰17 출시일과 스펙 변화');
});

test('uses the title recommendation capability only for AI title generation', async () => {
    let usageInput = null;
    const service = createKeywordsService({
        keywordResearchService: {
            isConfigured: () => true,
            suggestTitles: async () => ({ success: true, titles: [] })
        },
        smartUsageService: {
            async run(capability, input, action) {
                usageInput = { capability, input };
                return { result: await action(), sessionId: input.sessionId, usage: { capability, remaining: 79 } };
            }
        }
    });

    const result = await service.suggestTitles({
        subject: '아이폰17',
        keywords: ['아이폰17'],
        smart_usage_session_id: 'title-session',
        smart_usage_operation_id: 'title-op'
    });

    assert.equal(usageInput.capability, 'title_recommendation');
    assert.equal(usageInput.input.sessionId, 'title-session');
    assert.equal(result.smart_usage.remaining, 79);
});
