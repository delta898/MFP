const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsService, CARD_NEWS_SOURCE_LIMIT, isConfiguredAiModel } = require('./card-news.service');

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
    const generationService = overrides.generationService || {
        async generate(input) { return { id: 'generation-1', status: 'completed', input }; },
        async generateImages(input) { return { id: 'generation-1', status: 'completed', input }; },
        importLocalImage(input) { return { id: 'generation-1', status: 'completed', input }; },
        resolveAsset(generationId, fileName) { return { generationId, fileName }; },
        createExportBundle(generationId) { return { generationId, file_name: 'cards.zip' }; }
    };
    return {
        saved,
        service: createCardNewsService({
            CONFIG: {
                PATHS: { workspace: '/tmp/card-news-test' },
                TEXT_MODEL_CONFIG: { provider: 'google', code: 'text-model', api_key: 'test-key' },
                IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', api_key: 'test-key' }
            },
            sourceService,
            repository,
            createId: () => 'project-1',
            now: () => '2026-09-04T00:00:00.000Z',
            generationService,
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

test('delegates generation and local asset lookup through the card-news boundary', async () => {
    const { service } = createHarness();
    const generated = await service.generate({ source_snapshot: { title: '제목', text: '본문' } });
    assert.equal(generated.generation.id, 'generation-1');
    assert.deepEqual(service.resolveAsset('generation-1', 'card-01.png'), {
        generationId: 'generation-1',
        fileName: 'card-01.png'
    });
});

test('delegates AI image work and local image import through the card-news boundary', async () => {
    const { service } = createHarness();
    const generated = await service.generateImages({ generation_id: 'generation-1', mode: 'missing' });
    assert.equal(generated.generation.input.mode, 'missing');
    const imported = service.importLocalImage({ generation_id: 'generation-1', card_index: 2 });
    assert.equal(imported.generation.input.card_index, 2);
});

test('delegates complete-set export through the card-news boundary', () => {
    const { service } = createHarness();
    assert.deepEqual(service.createExportBundle('generation-1'), {
        generationId: 'generation-1',
        file_name: 'cards.zip'
    });
});

test('delegates publishing config and execution through the card-news boundary', async () => {
    const calls = [];
    const { service } = createHarness({
        publishingService: {
            getConfig(generationId) { calls.push(['config', generationId]); return { generation_id: generationId }; },
            async publish(input) { calls.push(['publish', input]); return { success: true }; }
        }
    });
    assert.equal(service.getPublishingConfig('generation-1').generation_id, 'generation-1');
    assert.equal((await service.publish({ generation_id: 'generation-1' })).success, true);
    assert.equal(calls.length, 2);
});

test('validates configured AI models before generation starts', async () => {
    assert.equal(isConfiguredAiModel({ provider: 'google', code: 'model', api_key: 'key' }), true);
    assert.equal(isConfiguredAiModel({ provider: 'direct', code: 'model', base_url: 'http://localhost:1234' }), true);
    assert.equal(isConfiguredAiModel({ provider: 'google', code: 'model' }), false);

    const { service } = createHarness({
        CONFIG: {
            PATHS: { workspace: '/tmp/card-news-test' },
            TEXT_MODEL_CONFIG: { provider: 'google', code: 'text-model', api_key: 'test-key' },
            IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', api_key: '' }
        }
    });
    await assert.rejects(() => service.generate({ source_snapshot: { title: '제목', text: '본문' } }), {
        code: 'CARD_NEWS_IMAGE_MODEL_REQUIRED'
    });
    const composed = await service.generate({
        source_snapshot: { title: '제목', text: '본문' },
        image_mode: 'prompt_only'
    });
    assert.equal(composed.generation.id, 'generation-1');
});
