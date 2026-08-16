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
