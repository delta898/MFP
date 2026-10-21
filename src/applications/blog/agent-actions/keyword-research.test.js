const test = require('node:test');
const assert = require('node:assert/strict');
const { createKeywordResearchCapabilities } = require('./keyword-research');

test('keyword analysis validates, previews, and returns measured and unavailable metrics distinctly', async () => {
    const calls = [];
    const [capability] = createKeywordResearchCapabilities({
        keywordResearchApplication: {
            async analyze(input) {
                calls.push(input);
                return {
                    input_keywords: [
                        { keyword: '오사카 여행', monthly_search_volume: { total: 24000 }, weekly_new_blog_documents: { count: null }, competition_strength: { level: '보통' } },
                        { keyword: '오사카 호텔', monthly_search_volume: { total: 8000 }, weekly_new_blog_documents: { count: 14, capped: true }, competition_strength: { level: '높음' } }
                    ]
                };
            }
        }
    });
    const validation = capability.validate({ keyword: ' 오사카 여행 ' });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.normalizedParams, {
        keywords: [' 오사카 여행 '], subject: '오사카 여행', related_assist: true, related_limit: 8
    });
    assert.match((await capability.preview(validation.normalizedParams)).summary, /오사카 여행/);

    const result = await capability.execute(validation.normalizedParams);
    assert.deepEqual(calls, [validation.normalizedParams]);
    assert.match(result.message, /최근 7일 신규 문서 측정 불가/);
    assert.match(result.message, /최근 7일 신규 문서 14\+건/);
    assert.equal(result.data.input_keywords.length, 2);
    assert.deepEqual(result.sideEffects, []);
});

test('keyword analysis rejects an empty request and surfaces application failures', async () => {
    const [capability] = createKeywordResearchCapabilities({
        keywordResearchApplication: { async analyze() { throw new Error('gateway unavailable'); } }
    });
    const invalid = capability.validate({});
    assert.equal(invalid.ok, false);
    assert.match(invalid.errors.join(' '), /키워드 또는 주제/);
    await assert.rejects(() => capability.execute({ keywords: ['오사카'], subject: '오사카' }), /gateway unavailable/);
    assert.deepEqual(createKeywordResearchCapabilities({}) , []);
});

test('title suggestion forwards normalized options and preserves generated output', async () => {
    const calls = [];
    const [, capability] = createKeywordResearchCapabilities({
        keywordResearchApplication: {
            async analyze() { return {}; },
            async suggestTitles(input) {
                calls.push(input);
                return { title_mode: input.title_mode, titles: [{ role: '검색 의도형', title: '오사카 여행 일정 짜는 법', seo_reason: '검색 의도 명확', click_reason: '구체적', tradeoff: '범위 좁음' }] };
            }
        }
    });
    const validation = capability.validate({ keyword: '오사카 여행', count: 2, title_mode: 'search' });
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.normalizedParams, {
        keyword: '오사카 여행', subject: '오사카 여행', content: '', title_mode: 'search', count: 2
    });
    assert.match((await capability.preview(validation.normalizedParams)).summary, /오사카 여행/);
    const result = await capability.execute(validation.normalizedParams);
    assert.deepEqual(calls, [validation.normalizedParams]);
    assert.match(result.message, /오사카 여행 일정 짜는 법/);
    assert.equal(result.data.titles.length, 1);
    assert.deepEqual(result.sideEffects, []);
});
