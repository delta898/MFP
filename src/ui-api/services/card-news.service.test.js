const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCardNewsService, CARD_NEWS_SOURCE_LIMIT, isConfiguredAiModel } = require('./card-news.service');
const {
    configureConnectionVerificationState,
    recordConnectionVerification,
    resetConnectionVerificationState
} = require('../../connections/verification-state');
const { createAiModelVerificationSignature } = require('../../ai/model-verification');
const { applyRemoteCatalog, clearRemoteCatalog } = require('../../ai/catalog-registry');

const CARD_NEWS_IMAGE_MODELS = [
    ['google', 'gemini-3.1-flash-image', 'Gemini 3.1 Flash Image'],
    ['google', 'gemini-3.1-flash-lite-image', 'Gemini 3.1 Flash Lite Image'],
    ['openai', 'gpt-image-1', 'GPT Image 1'],
    ['openai', 'gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'],
    ['openai', 'gpt-image-2.5-flare', 'GPT Image 2.5 Flare'],
    ['openai', 'gpt-image-2', 'GPT Image 2']
];

test.beforeEach(() => {
    applyRemoteCatalog({
        schema_version: 1,
        version: 'card-news-image-fixtures',
        providers: [
            { kind: 'image', id: 'google', display_name: 'Google', sort_order: 1 },
            { kind: 'image', id: 'openai', display_name: 'OpenAI', sort_order: 2 }
        ],
        models: CARD_NEWS_IMAGE_MODELS.map(([provider, code, name]) => ({
            key: `${provider}:${code}`, kind: 'image', provider, model_id: code,
            transport: provider === 'google' ? 'gemini_generate_content' : 'openai_images',
            display_name: name, status: 'active',
            capabilities: provider === 'google'
                ? { aspect_ratio: true }
                : { arbitrary_size: true, quality: ['auto'], response_format: false }
        }))
    }, { appVersion: '99.0.0' });
});
test.afterEach(clearRemoteCatalog);

function createHarness(overrides = {}) {
    const saved = [];
    const repository = {
        save(project) { saved.push(project); return project; },
        list() { return [...saved].reverse(); },
        get(id) { return saved.find((project) => project.id === id) || null; }
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
        async generate(input) { return { id: 'generation-1', project_id: input.project_id, status: 'completed', input }; },
        async generateImages(input) { return { id: 'generation-1', status: 'completed', input }; },
        importLocalImage(input) { return { id: 'generation-1', status: 'completed', input }; },
        previewZip(input) { return { card_count: 2, input }; },
        importZip(input) { return { id: 'generation-zip', title: input.title, status: 'completed', cards: [{}, {}] }; },
        getGeneration(id) {
            if (id === 'missing-generation') throw new Error('missing');
            return {
                id,
                project_id: id === 'generation-1' ? 'project-1' : '',
                title: '저장된 카드뉴스',
                status: 'completed',
                completed_at: '2026-09-05T01:00:00.000Z',
                cards: [{ image_url: '/image.png' }]
            };
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

test('starts, polls, and cancels a card-news image operation through the shared operation lifecycle', async () => {
    const generationService = {
        getGeneration() { return { id: 'generation-1', title: '테스트 카드뉴스' }; },
        async generateImages({ signal }) {
            return new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => {
                    const error = new Error('AI_GENERATION_CANCELED');
                    error.code = 'AI_GENERATION_CANCELED';
                    reject(error);
                }, { once: true });
            });
        }
    };
    const { service } = createHarness({
        generationService,
        CONFIG: {
            PATHS: { workspace: '/tmp/card-news-test' },
            TEXT_MODEL_CONFIG: { provider: 'google', code: 'text-model', api_key: 'test-key' },
            IMAGE_MODEL_CONFIG: { provider: 'kie', code: 'image-model', api_key: 'test-key', transport: 'kie_market_image_jobs' }
        },
        ledgerSync: { async recordGenerationProgress() {} }
    });
    const started = service.startImageOperation({ generation_id: 'generation-1', mode: 'all' });
    assert.ok(started.operationId);
    assert.equal(started.remoteJobPossible, true);
    assert.equal(service.getImageOperation(started.operationId).busy, true);
    const requested = service.cancelImageOperation(started.operationId);
    assert.equal(requested.state, 'cancel_requested');
    let current = requested;
    for (let attempt = 0; attempt < 20 && current.state !== 'canceled'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        current = service.getImageOperation(started.operationId);
    }
    assert.equal(current.state, 'canceled');
    assert.equal(current.busy, false);
});

test('starts and cancels card-news composition through the shared operation lifecycle', async () => {
    let receivedSignal;
    const generationService = {
        async generate(input) {
            receivedSignal = input.signal;
            return new Promise((_resolve, reject) => {
                input.signal.addEventListener('abort', () => {
                    const error = new Error('AI_GENERATION_CANCELED');
                    error.code = 'AI_GENERATION_CANCELED';
                    reject(error);
                }, { once: true });
            });
        }
    };
    const { service } = createHarness({ generationService });
    const started = service.startCompositionOperation({
        source_snapshot: { source: { kind: 'manuscript' }, title: '구성 중지 테스트', text: '본문' },
        image_mode: 'prompt_only'
    });
    assert.ok(started.operationId);
    assert.equal(service.getCompositionOperation(started.operationId).busy, true);
    for (let attempt = 0; attempt < 20 && !receivedSignal; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(receivedSignal instanceof AbortSignal);
    const requested = service.cancelCompositionOperation(started.operationId);
    assert.equal(requested.state, 'cancel_requested');
    let current = requested;
    for (let attempt = 0; attempt < 20 && current.state !== 'canceled'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        current = service.getCompositionOperation(started.operationId);
    }
    assert.equal(current.state, 'canceled');
    assert.equal(current.busy, false);
});

test('composition cancellation is disabled once the validated result enters finalization', async () => {
    let finishGeneration;
    const generationService = {
        generate(input) {
            input.beginCommit();
            return new Promise((resolve) => { finishGeneration = resolve; });
        }
    };
    const { service } = createHarness({ generationService });
    const started = service.startCompositionOperation({
        source_snapshot: { source: { kind: 'manuscript' }, title: '구성 완료 경계', text: '본문' },
        image_mode: 'prompt_only'
    });
    for (let attempt = 0; attempt < 20 && !finishGeneration; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(service.getCompositionOperation(started.operationId).canCancel, false);
    const tooLate = service.cancelCompositionOperation(started.operationId);
    assert.equal(tooLate.cancelOutcome, 'too_late');
    finishGeneration({ id: 'generation-final', status: 'prompt_ready', cards: [] });
    let current = tooLate;
    for (let attempt = 0; attempt < 20 && current.state !== 'completed'; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        current = service.getCompositionOperation(started.operationId);
    }
    assert.equal(current.state, 'completed');
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
        status_tone: 'neutral',
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
    const { service, saved } = createHarness();
    const generated = await service.generate({ source_snapshot: { title: '제목', text: '본문' } });
    assert.equal(generated.generation.id, 'generation-1');
    assert.equal(generated.generation.project_id, 'project-1');
    assert.equal(saved[0].source_snapshot.text, '본문');
    assert.equal(generated.generation.input.source_snapshot, saved[0].source_snapshot);
    assert.deepEqual(service.resolveAsset('generation-1', 'card-01.png'), {
        generationId: 'generation-1',
        fileName: 'card-01.png'
    });
});

test('stores RSS, URL, and manuscript sources through the same project snapshot contract', async () => {
    const snapshots = [
        { source: { kind: 'feed_item', item_key: 'feed-1' }, title: 'RSS', text: 'RSS 본문' },
        { source: { kind: 'url', canonical_url: 'https://example.com/post' }, title: 'URL', text: 'URL 본문', canonical_url: 'https://example.com/post' },
        { source: { kind: 'manuscript', title: '직접 입력', text: '직접 입력 본문' }, title: '직접 입력', text: '직접 입력 본문' }
    ];

    for (const snapshot of snapshots) {
        const { service, saved } = createHarness();
        await service.generate({ source_snapshot: snapshot, image_mode: 'prompt_only' });
        assert.equal(saved[0].source_snapshot.source.kind, snapshot.source.kind);
        assert.equal(saved[0].source_snapshot.text, snapshot.text);
    }
});

test('continues a project from its stored source snapshot instead of changed client content', async () => {
    const calls = [];
    const generationService = {
        async generate(input) {
            calls.push(input);
            return { id: 'generation-2', status: 'completed' };
        }
    };
    const { service, saved } = createHarness({ generationService });
    saved.push({ id: 'project-existing', source_snapshot: { title: '보존 제목', text: '보존 본문' } });

    const result = await service.generate({
        project_id: 'project-existing',
        source_snapshot: { title: '변조 제목', text: '변조 본문' },
        image_mode: 'prompt_only'
    });

    assert.equal(result.generation.project_id, 'project-existing');
    assert.equal(calls[0].source_snapshot.text, '보존 본문');
});

test('returns a linked project snapshot and silently omits it for older generations', () => {
    const { service, saved } = createHarness();
    saved.push({ id: 'project-1', source_snapshot: { title: '보존 제목', text: '보존 본문' } });

    assert.equal(service.getGeneration('generation-1').source_snapshot.text, '보존 본문');
    assert.equal(service.getGeneration('generation-old').source_snapshot, null);
});

test('delegates AI image work and local image import through the card-news boundary', async () => {
    const { service } = createHarness();
    const generated = await service.generateImages({ generation_id: 'generation-1', mode: 'missing' });
    assert.equal(generated.generation.input.mode, 'missing');
    const imported = await service.importLocalImage({ generation_id: 'generation-1', card_index: 2 });
    assert.equal(imported.generation.input.card_index, 2);
});

test('lists only configured, verified image profiles without exposing credentials', () => {
    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', name: 'Default image', api_key: 'test-key' },
            AI_MODEL_PROFILES: { image: {
                google: { provider: 'google', code: 'image-model', name: 'Default image', api_key: 'test-key' },
                openai: { provider: 'openai', code: 'gpt-image-1', name: 'GPT Image', api_key: '' },
                kie: { provider: 'kie', code: 'seedream', name: 'Seedream', api_key: 'kie-key' }
            } }
        },
        isImageModelVerified: (model) => model.provider !== 'kie'
    });
    const result = service.listImageModels();
    assert.deepEqual(result.providers.map(({ provider }) => provider), ['google']);
    assert.ok(result.providers[0].models.length > 1);
    assert.ok(result.providers[0].models.some(({ code }) => code === 'gemini-3.1-flash-image'));
    assert.equal(JSON.stringify(result).includes('test-key'), false);
    assert.equal(JSON.stringify(result).includes('kie-key'), false);
});

test('lists a Google image provider verified with its fixed endpoint when the saved profile omits Base URL', () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'card-news-model-verification-')), 'connection_verification.json');
    configureConnectionVerificationState({ fs, path, filePath });
    resetConnectionVerificationState({ filePath });
    const google = {
        provider: 'google',
        code: 'gemini-3.1-flash-image',
        name: 'Gemini 3.1 Flash Image',
        api_key: 'fixture-google-key',
        base_url: ''
    };
    const signature = createAiModelVerificationSignature('image', {
        ...google,
        base_url: 'https://generativelanguage.googleapis.com/v1beta'
    });
    recordConnectionVerification('ai-role', signature, { success: true, connected: true }, {
        scope: 'image',
        provider: 'google',
        code: google.code,
        base_url: 'https://generativelanguage.googleapis.com/v1beta'
    });

    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { ...google },
            AI_MODEL_PROFILES: { image: { google } }
        }
    });

    assert.deepEqual(service.listImageModels().providers.map(({ provider }) => provider), ['google']);
});

test('uses the explicitly selected verified model for subsequent Card News image generation', async () => {
    let received;
    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', api_key: 'default-key' },
            AI_MODEL_PROFILES: { image: {
                google: { provider: 'google', code: 'image-model', api_key: 'default-key' },
                openai: { provider: 'openai', code: 'gpt-image-1', api_key: 'other-key' }
            } }
        },
        isImageModelVerified: (model) => model.provider === 'openai',
        generationService: {
            async generateImages(input) { received = input; return { id: 'generation-1', status: 'completed' }; },
            getGeneration() { return { id: 'generation-1', title: '제목' }; }
        }
    });
    await service.generateImages({
        generation_id: 'generation-1',
        image_model_selection: { provider: 'openai', code: 'gpt-image-1' }
    });
    assert.equal(received.imageModelConfig.provider, 'openai');
    assert.equal(received.imageModelConfig.api_key, undefined);
});

test('lists the selected provider image catalog and passes only the selected model identity to generation', async () => {
    let received;
    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { provider: 'openai', code: 'gpt-image-2.5-sunburst', api_key: 'openai-key' },
            AI_MODEL_PROFILES: { image: {
                openai: { provider: 'openai', code: 'gpt-image-2.5-sunburst', api_key: 'openai-key' }
            } }
        },
        isImageModelVerified: (profile) => profile.provider === 'openai',
        generationService: {
            async generateImages(input) { received = input; return { id: 'generation-1', status: 'completed' }; },
            getGeneration() { return { id: 'generation-1', title: '제목' }; }
        }
    });
    const listing = service.listImageModels();
    assert.ok(listing.providers.find((item) => item.provider === 'openai').models.length >= 2);
    await service.generateImages({
        generation_id: 'generation-1',
        image_model_selection: { provider: 'openai', code: 'gpt-image-2.5-flare' }
    });
    assert.equal(received.imageModelConfig.provider, 'openai');
    assert.equal(received.imageModelConfig.code, 'gpt-image-2.5-flare');
    assert.equal(received.imageModelConfig.api_key, undefined);
});

test('lists a verified keyless direct image model only when the Gateway advertises its configured route', () => {
    const direct = {
        provider: 'direct', code: 'local-image-v1', name: 'Local Image',
        base_url: 'http://127.0.0.1:1234/v1', api_key: ''
    };
    const { service } = createHarness({
        CONFIG: { IMAGE_MODEL_CONFIG: direct, AI_MODEL_PROFILES: { image: { direct } } },
        getSupportedImageModels: () => [{ provider: 'direct', code: 'local-image-v1' }],
        isImageModelVerified: (profile) => profile.provider === 'direct'
    });
    const listing = service.listImageModels();
    assert.deepEqual(listing.providers.map(({ provider, name }) => ({ provider, name })), [
        { provider: 'direct', name: '직접 입력' }
    ]);
    assert.deepEqual(listing.providers[0].models.map(({ provider, code }) => ({ provider, code })), [
        { provider: 'direct', code: 'local-image-v1' }
    ]);
    assert.equal(JSON.stringify(listing).includes('127.0.0.1'), false);
    assert.equal(JSON.stringify(listing).includes('api_key'), false);
});

test('does not list a configured direct image model when the Gateway has no matching route', () => {
    const direct = { provider: 'direct', code: 'local-image-v1', base_url: 'http://127.0.0.1:1234/v1' };
    const { service } = createHarness({
        CONFIG: { IMAGE_MODEL_CONFIG: direct, AI_MODEL_PROFILES: { image: { direct } } },
        getSupportedImageModels: () => [],
        isImageModelVerified: () => true
    });
    assert.deepEqual(service.listImageModels().providers, []);
});

test('rejects an explicit Card News model selection when its connection is not verified', async () => {
    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', api_key: 'default-key' },
            AI_MODEL_PROFILES: { image: {
                openai: { provider: 'openai', code: 'gpt-image-1', api_key: 'other-key' }
            } }
        },
        isImageModelVerified: () => false
    });
    await assert.rejects(
        service.generateImages({ generation_id: 'generation-1', image_model_selection: { provider: 'openai', code: 'gpt-image-1' } }),
        (error) => error.code === 'CARD_NEWS_IMAGE_MODEL_UNVERIFIED'
    );
});

test('rejects an explicit profile selection when its API key is not configured', async () => {
    const { service } = createHarness({
        CONFIG: {
            IMAGE_MODEL_CONFIG: { provider: 'google', code: 'image-model', api_key: 'default-key' },
            AI_MODEL_PROFILES: { image: {
                openai: { provider: 'openai', code: 'gpt-image-1', api_key: '' }
            } }
        },
        isImageModelVerified: () => true
    });
    await assert.rejects(
        service.generateImages({ generation_id: 'generation-1', image_model_selection: { provider: 'openai', code: 'gpt-image-1' } }),
        (error) => error.code === 'CARD_NEWS_IMAGE_MODEL_UNAVAILABLE'
    );
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
    await service.publish({ generation_id: 'generation-1', preview_token: 'preview-token' });
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
    await assert.rejects(() => service.publish({ generation_id: 'generation-1', preview_token: 'preview-token' }), /Buffer failure/);
    assert.deepEqual(calls, [['generation-1', 'Buffer failure']]);
});

test('delegates complete-set export through the card-news boundary', async () => {
    const { service } = createHarness();
    assert.deepEqual(await service.createExportBundle('generation-1'), {
        generationId: 'generation-1',
        file_name: 'cards.zip'
    });
});

test('prepares watermark bytes before building a complete-set export bundle', async () => {
    const asset = { index: 1, path: '/original/01.png', file_name: '01.png', mime_type: 'image/png' };
    let bundleOptions;
    const { service } = createHarness({
        generationService: {
            resolveCompleteAssets() { return { assets: [asset] }; },
            createExportBundle(id, options) { bundleOptions = options; return { generationId: id, file_name: 'cards.zip' }; }
        },
        outgoingImageService: {
            async prepareAssets(assets, signature, expectedSignature, options) {
                assert.equal(signature, 'My Brand');
                assert.equal(expectedSignature, 'My Brand');
                assert.deepEqual(options, { force: true });
                return assets.map((item) => ({ ...item, buffer: Buffer.from('watermarked-image') }));
            }
        }
    });
    const bundle = await service.createExportBundle('generation-1', 'My Brand', 'My Brand');
    assert.equal(bundle.file_name, 'cards.zip');
    assert.equal(bundleOptions.assetDataByName['01.png'].toString(), 'watermarked-image');
});

test('exposes the resolved signature policy and its preview snapshot token', async () => {
    const { service } = createHarness({
        outgoingImageService: {
            async getSignaturePolicy(signature, options) {
                assert.equal(signature, 'My Brand');
                assert.deepEqual(options, { force: true });
                return { editable: true, plan_verified: true, plan_code: 'pro', default_signature: '', effective_signature: 'My Brand', preview_token: 'preview-token' };
            }
        }
    });
    assert.deepEqual(await service.getSignaturePolicy('My Brand'), {
        editable: true,
        plan_verified: true,
        plan_code: 'pro',
        default_signature: '',
        effective_signature: 'My Brand',
        preview_token: 'preview-token'
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
    assert.equal((await service.publish({ generation_id: 'generation-1', preview_token: 'preview-token' })).success, true);
    assert.equal(calls.length, 2);
});

test('requires the server-issued preview policy token before card-news publishing', async () => {
    let publishCalls = 0;
    const { service } = createHarness({
        publishingService: {
            getConfig() { return {}; },
            async publish() { publishCalls += 1; return { success: true }; }
        }
    });
    await assert.rejects(
        () => service.publish({ generation_id: 'generation-1' }),
        (error) => error.status === 409 && error.apiCode === 'CARD_NEWS_SIGNATURE_PREVIEW_STALE'
    );
    assert.equal(publishCalls, 0);
});

test('validates configured AI models before generation starts without passing API keys into the generation application', async () => {
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
        code: 'CARD_NEWS_IMAGE_MODEL_UNAVAILABLE'
    });
    const composed = await service.generate({
        source_snapshot: { title: '제목', text: '본문' },
        image_mode: 'prompt_only'
    });
    assert.equal(composed.generation.id, 'generation-1');
});
