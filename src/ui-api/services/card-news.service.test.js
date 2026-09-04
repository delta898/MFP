const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsService, CARD_NEWS_SOURCE_LIMIT } = require('./card-news.service');

function createHarness(overrides = {}) {
    const saved = [];
    const repository = {
        save(project) { saved.push(project); return project; },
        list() { return [...saved].reverse(); }
    };
    const sourceService = {
        async discoverConfiguredArticles() {
            return {
                articles: [
                    ...Array.from({ length: CARD_NEWS_SOURCE_LIMIT + 3 }, (_, index) => ({
                        item_key: `naver-${index}`,
                        source_platform: 'naver'
                    })),
                    ...Array.from({ length: 10 }, (_, index) => ({
                        item_key: `wordpress-${index}`,
                        source_platform: 'wordpress'
                    }))
                ],
                failures: [{ source_platform: 'wordpress' }],
                configured_feed_count: 2,
                configured_sources: ['naver', 'wordpress']
            };
        },
        async resolveSourceSnapshot(source) {
            if (source.fail) {
                const error = new Error('참고 페이지를 불러오지 못했습니다.');
                error.code = 'STYLE_REFERENCE_FETCH_FAILED';
                throw error;
            }
            return {
                source,
                title: source.title || '원문 제목',
                text: source.text || '원문 본문',
                excerpt: source.text || '원문 본문',
                canonical_url: source.canonical_url || '',
                retrieved_at: '2026-09-04T00:00:00.000Z'
            };
        }
    };
    return {
        saved,
        service: createCardNewsService({
            CONFIG: { PATHS: { workspace: '/tmp/card-news-test' } },
            sourceService,
            repository,
            createId: () => 'project-1',
            now: () => '2026-09-04T00:00:00.000Z',
            ...overrides
        })
    };
}

test('lists configured articles with a separate limit per platform and isolated failures', async () => {
    const { service } = createHarness();
    const result = await service.listSources();
    assert.equal(result.articles.length, CARD_NEWS_SOURCE_LIMIT + 10);
    assert.equal(result.articles.filter((article) => article.source_platform === 'naver').length, CARD_NEWS_SOURCE_LIMIT);
    assert.equal(result.articles.filter((article) => article.source_platform === 'wordpress').length, 10);
    assert.equal(result.configured_feed_count, 2);
    assert.deepEqual(result.configured_sources, ['naver', 'wordpress']);
    assert.equal(result.failures.length, 1);
});

test('previews a source and requires explicit source input', async () => {
    const { service } = createHarness();
    await assert.rejects(() => service.previewSource({}), { code: 'CARD_NEWS_SOURCE_REQUIRED' });
    const result = await service.previewSource({ source: { kind: 'manuscript', title: '제목', text: '본문' } });
    assert.equal(result.source_snapshot.title, '제목');
});

test('translates shared public fetch errors into card-news user language', async () => {
    const { service } = createHarness();
    await assert.rejects(
        () => service.previewSource({ source: { kind: 'url', canonical_url: 'https://example.com', fail: true } }),
        (error) => error.code === 'CARD_NEWS_SOURCE_FETCH_FAILED' && error.message === '입력한 페이지를 불러오지 못했습니다.'
    );
});

test('creates and lists durable source projects', async () => {
    const { service, saved } = createHarness();
    const created = await service.createProject({ source: { kind: 'manuscript', title: '제목', text: '본문' } });
    assert.equal(created.project.id, 'project-1');
    assert.equal(created.project.source_kind, 'manuscript');
    assert.equal(saved.length, 1);
    assert.deepEqual(service.listProjects().projects.map((project) => project.id), ['project-1']);
});
