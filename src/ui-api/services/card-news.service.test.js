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
        previewZip(input) { return { card_count: 2, input }; },
        importZip(input) { return { id: 'generation-zip', title: input.title, status: 'completed', cards: [{}, {}] }; },
        getGeneration(id) {
            if (id === 'missing-generation') throw new Error('missing');
            return { id, title: '저장된 카드뉴스', status: 'completed', completed_at: '2026-09-05T01:00:00.000Z', cards: [{ image_url: '/image.png' }] };
        },
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

test('annotates source articles and lists only ledger rows with a generation', async () => {
    const ledgerSync = {
        async registerSources() { return { results: [] }; },
        annotateSources(items) {
            return items.map((item, index) => index === 0
                ? { ...item, management: { publishing_status: '발행 완료', generation_id: 'generation-1' } }
                : item);
        },
        async listManagedRows() {
            return [
                {
                    generationId: 'generation-1', title: '완료 글', workflowStatus: '제작 완료', publishingStatus: '발행 완료',
                    sourcePlatform: 'naver', originalUrl: 'https://example.com/one', cardCount: '1', channels: 'Threads',
                    postLinks: 'https://threads.net/post/1', processedAt: '2026-09-05T02:00:00.000Z'
                },
                {
                    generationId: 'missing-generation', title: '로컬 없음', workflowStatus: '제작 중', publishingStatus: '미발행',
                    sourcePlatform: 'wordpress', originalUrl: 'https://example.com/two', cardCount: '3', collectedAt: '2026-09-05T00:00:00.000Z'
                }
            ];
        }
    };
    const { service } = createHarness({ ledgerSync });
    const sources = await service.listSources();
    const managed = await service.listManagedItems();
    assert.equal(sources.articles[0].management.publishing_status, '발행 완료');
    assert.equal(managed.items[0].status, '발행 완료');
    assert.equal(managed.items[0].status_key, 'published');
    assert.equal(managed.items[0].action_label, '결과 보기');
    assert.equal(managed.items[0].local_available, true);
    assert.equal(managed.items[1].status, '작업 중');
    assert.equal(managed.items[1].local_available, false);
    assert.equal(service.getGeneration('generation-1').generation.id, 'generation-1');
});

test('returns source articles when ledger registration does not settle in time', async () => {
    const warnings = [];
    const ledgerSync = {
        registerSources() { return new Promise(() => {}); },
        annotateSources(items, registration) {
            assert.equal(registration, null);
            return items;
        }
    };
    const { service } = createHarness({
        ledgerSync,
        ledgerRegistrationTimeoutMs: 5,
        logger: { warn(message) { warnings.push(message); } }
    });

    const result = await service.listSources();

    assert.equal(result.articles.length, CARD_NEWS_SOURCE_LIMIT + 10);
    assert.match(warnings[0], /원문 목록을 먼저 반환/);
});

test('lists local card news when the managed ledger does not settle in time', async () => {
    const warnings = [];
    const generationService = {
        listGenerations() {
            return [{
                id: 'generation-local',
                title: '로컬 카드뉴스',
                source_url: 'https://example.com/local',
                source_platform: 'naver',
                status: 'prompt_ready',
                created_at: '2026-09-06T01:00:00.000Z',
                completed_at: '',
                cards: [{ image_url: '' }, { image_url: '/card-2.png' }]
            }];
        },
        getGeneration() { return null; }
    };
    const ledgerSync = {
        listManagedRows() { return new Promise(() => {}); }
    };
    const { service } = createHarness({
        generationService,
        ledgerSync,
        ledgerRegistrationTimeoutMs: 5,
        logger: { warn(message) { warnings.push(message); } }
    });

    const result = await service.listManagedItems();

    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0], {
        generation_id: 'generation-local',
        title: '로컬 카드뉴스',
        source_platform: 'naver',
        source_url: 'https://example.com/local',
        status: '작업 중',
        status_key: 'in_progress',
        status_tone: 'running',
        action_label: '계속 만들기',
        workflow_status: '제작 중',
        publishing_status: '미발행',
        card_count: 2,
        image_count: 1,
        local_available: true,
        channels: [],
        post_links: [],
        updated_at: '2026-09-06T01:00:00.000Z',
        last_error: ''
    });
    assert.match(warnings[0], /로컬 결과를 먼저 반환/);
});

test('merges managed rows and local generations without duplicate generation ids', async () => {
    const localGenerations = [
        { id: 'generation-1', title: '관리대장에도 있음', status: 'completed', cards: [{}], created_at: '2026-09-05T00:00:00.000Z' },
        { id: 'generation-2', title: '로컬에만 있음', status: 'prompt_ready', cards: [{}, {}], created_at: '2026-09-06T00:00:00.000Z' }
    ];
    const generationService = {
        listGenerations() { return localGenerations; },
        getGeneration(id) { return localGenerations.find((generation) => generation.id === id); }
    };
    const ledgerSync = {
        async listManagedRows() {
            return [{ generationId: 'generation-1', title: '관리 항목', workflowStatus: '제작 완료', publishingStatus: '미발행' }];
        }
    };
    const { service } = createHarness({ generationService, ledgerSync });

    const result = await service.listManagedItems();

    assert.deepEqual(result.items.map((item) => item.generation_id), ['generation-2', 'generation-1']);
    assert.equal(new Set(result.items.map((item) => item.generation_id)).size, 2);
});

test('previews a source and requires explicit source input', async () => {
    const { service } = createHarness();
    await assert.rejects(() => service.previewSource({}), { code: 'CARD_NEWS_SOURCE_REQUIRED' });
    const result = await service.previewSource({ source: { kind: 'manuscript', title: '제목', text: '본문' } });
    assert.equal(result.source_snapshot.title, '제목');
    assert.equal(result.source_snapshot.source.management_id, 'project-1');
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
    const imported = await service.importLocalImage({ generation_id: 'generation-1', card_index: 2 });
    assert.equal(imported.generation.input.card_index, 2);
});

test('previews and imports a ZIP without requiring an AI model', async () => {
    const calls = [];
    const { service } = createHarness({
        ledgerSync: {
            async registerSources() {},
            async recordImportedGeneration(snapshot, generation) { calls.push([snapshot, generation]); }
        }
    });
    assert.equal(service.previewZip({ base64_data: 'zip' }).card_count, 2);
    const imported = await service.importZip({ base64_data: 'zip', title: '가져온 세트', source_url: 'https://example.com/post' });
    assert.equal(imported.generation.id, 'generation-zip');
    assert.equal(calls[0][0].canonical_url, 'https://example.com/post');
    assert.equal(calls[0][1].status, 'completed');
});

test('synchronizes RSS discovery, generation, image progress, and publishing through the ledger boundary', async () => {
    const calls = [];
    const ledgerSync = {
        async registerSources(items) { calls.push(['sources', items.length]); },
        async recordGeneration(snapshot, generation) { calls.push(['generation', snapshot.title, generation.id]); },
        async recordGenerationProgress(generation) { calls.push(['progress', generation.id]); },
        async recordPublishing(id, result) { calls.push(['published', id, result.success]); },
        async recordPublishingFailure(id, error) { calls.push(['publish-failed', id, error.message]); }
    };
    const { service } = createHarness({
        ledgerSync,
        publishingService: {
            getConfig() { return {}; },
            async publish() { return { success: true, confirmed: true, results: [] }; }
        }
    });
    await service.listSources();
    await service.generate({ source_snapshot: { title: '제목', text: '본문' }, image_mode: 'prompt_only' });
    await service.generateImages({ generation_id: 'generation-1' });
    await service.importLocalImage({ generation_id: 'generation-1', card_index: 1 });
    await service.publish({ generation_id: 'generation-1' });
    assert.deepEqual(calls.map((call) => call[0]), ['sources', 'generation', 'progress', 'progress', 'published']);
});

test('keeps publishing errors while recording the ledger failure state', async () => {
    const calls = [];
    const { service } = createHarness({
        ledgerSync: {
            async registerSources() {},
            async recordGeneration() {},
            async recordGenerationProgress() {},
            async recordPublishing() {},
            async recordPublishingFailure(id, error) { calls.push([id, error.message]); }
        },
        publishingService: {
            getConfig() { return {}; },
            async publish() { throw new Error('Buffer failure'); }
        }
    });
    await assert.rejects(() => service.publish({ generation_id: 'generation-1' }), /Buffer failure/);
    assert.deepEqual(calls, [['generation-1', 'Buffer failure']]);
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
    assert.equal((await service.getPublishingConfig('generation-1')).generation_id, 'generation-1');
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
