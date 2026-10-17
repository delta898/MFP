const crypto = require('node:crypto');
const fileSystem = require('node:fs');
const { createCardNewsSourceService } = require('../../card-news/source-service');
const { createCardNewsProject } = require('../../card-news/project');
const { createCardNewsProjectRepository } = require('../../card-news/project-repository');
const { createCardNewsPublishingService } = require('../../card-news/publishing-service');
const { createCardNewsLedgerSyncService } = require('../../card-news/ledger-sync-service');
const { createCardNewsFeedFetcher } = require('../../card-news/feed-fetcher');
const { normalizeImageMode, validateSourceSnapshot } = require('../../card-news/generation');
const { createStyleReferenceFetcher } = require('../../content/style-reference-fetcher');
const { deriveCardNewsManagementState, toCardNewsManagementFields } = require('../../card-news/management-status');
const { createAiGenerationOperationManager } = require('../../services/ai/generation-operation-manager');
const { createCardNewsOutgoingImageService } = require('../../card-news/outgoing-image-service');
const { getAiModelCatalog, resolveAiModelConfig, resolveStoredModelProfiles } = require('../../ai-model-config');
const { getTrustedAiModelVerification } = require('../../ai/model-verification');

const CARD_NEWS_SOURCE_LIMIT = 30;
const CARD_NEWS_LEDGER_REGISTRATION_TIMEOUT_MS = 3000;

function settleWithin(promise, timeoutMs) {
    const boundedTimeoutMs = Math.max(1, Number(timeoutMs || 0));
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve({ timedOut: true, value: null }), boundedTimeoutMs);
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve({ timedOut: false, value });
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function limitArticlesPerPlatform(articles = [], limit = CARD_NEWS_SOURCE_LIMIT) {
    const counts = new Map();
    return articles.filter((article) => {
        const platform = String(article?.source_platform || 'unknown');
        const count = counts.get(platform) || 0;
        if (count >= limit) return false;
        counts.set(platform, count + 1);
        return true;
    });
}

function createApiError(code, message, status = 400, cause) {
    const error = new Error(message);
    error.code = code;
    error.apiCode = code;
    error.status = status;
    if (cause) error.cause = cause;
    return error;
}

function toCardNewsError(error, fallbackCode, fallbackMessage) {
    if (error?.apiCode) return error;
    const code = String(error?.code || fallbackCode).replace(/^STYLE_REFERENCE_/, 'CARD_NEWS_SOURCE_');
    const styleMessage = String(error?.message || '');
    const message = styleMessage
        .replace(/문체 참고 URL/g, '입력한 URL')
        .replace(/참고 URL/g, '입력한 URL')
        .replace(/참고 페이지/g, '입력한 페이지')
        .replace(/분석할 본문/g, '카드뉴스로 만들 본문');
    return createApiError(code, message || fallbackMessage, Number(error?.status || 400), error);
}

function summarizeProject(project = {}) {
    return {
        id: String(project.id || ''),
        title: String(project.title || '새 카드뉴스'),
        status: String(project.status || 'draft'),
        revision: Number(project.revision || 1),
        source_kind: String(project.source_snapshot?.source?.kind || ''),
        source_url: String(project.source_snapshot?.canonical_url || ''),
        source_excerpt: String(project.source_snapshot?.excerpt || ''),
        created_at: String(project.created_at || ''),
        updated_at: String(project.updated_at || '')
    };
}

function isConfiguredAiModel(model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const code = String(model.code || '').trim();
    if (!code) return false;
    if (provider === 'direct') return Boolean(String(model.base_url || '').trim());
    return Boolean(String(model.api_key || '').trim());
}

function imageModelIdentity(model = {}) {
    return `${String(model.provider || '').trim().toLowerCase()}:${String(model.code || '').trim()}`;
}

function hasSelectableImageCredentials(model = {}) {
    return model.provider === 'direct'
        ? Boolean(String(model.base_url || '').trim())
        : Boolean(String(model.api_key || '').trim());
}

function cardNewsManagementStatus(row = {}) {
    return deriveCardNewsManagementState(row).label;
}

function splitLedgerValues(value = '') {
    return String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function summarizeManagedCardNews(row = {}, generation = null) {
    const cards = Array.isArray(generation?.cards) ? generation.cards : [];
    const management = toCardNewsManagementFields(row);
    return {
        generation_id: String(row.generationId || ''),
        title: String(row.title || generation?.title || '제목 없는 카드뉴스'),
        source_platform: String(row.sourcePlatform || ''),
        source_url: String(row.originalUrl || generation?.source_url || ''),
        ...management,
        workflow_status: String(row.workflowStatus || ''),
        publishing_status: String(row.publishingStatus || ''),
        card_count: Number(row.cardCount || cards.length || 0),
        image_count: cards.filter((card) => card.image_url).length,
        local_available: Boolean(generation),
        channels: splitLedgerValues(row.channels),
        post_links: splitLedgerValues(row.postLinks),
        updated_at: String(row.processedAt || generation?.completed_at || generation?.created_at || row.collectedAt || row.rssPublishedAt || ''),
        last_error: String(row.lastError || '')
    };
}

function summarizeLocalCardNews(generation = {}) {
    return summarizeManagedCardNews({
        generationId: generation.id,
        title: generation.title,
        sourcePlatform: generation.source_platform || 'local',
        originalUrl: generation.source_url,
        workflowStatus: generation.status === 'completed' ? '제작 완료' : '제작 중',
        publishingStatus: '미발행',
        cardCount: Array.isArray(generation.cards) ? generation.cards.length : 0,
        collectedAt: generation.completed_at || generation.created_at
    }, generation);
}

function createCardNewsService(deps = {}) {
    const {
        CONFIG = {},
        License,
        axios,
        cheerio,
        fs,
        path,
        logger,
        now = () => new Date().toISOString(),
        createId = () => crypto.randomUUID()
    } = deps;
    const isImageModelVerified = typeof deps.isImageModelVerified === 'function'
        ? deps.isImageModelVerified
        : (model) => Boolean(getTrustedAiModelVerification('image', model));

    const outgoingImageService = deps.outgoingImageService || createCardNewsOutgoingImageService({
        License,
        fileSystem: fs || fileSystem,
        logger
    });

    const fetchFeed = deps.fetchFeed || (axios
        ? createCardNewsFeedFetcher({ httpClient: axios })
        : async () => { throw createApiError('CARD_NEWS_FEED_UNAVAILABLE', '블로그 글 목록 조회 기능이 준비되지 않았습니다.', 500); });

    let sourceService = deps.sourceService;
    if (!sourceService) {
        const fetchReference = deps.fetchPublicDocument || createStyleReferenceFetcher({ axios, cheerio });
        sourceService = createCardNewsSourceService({
            fetchFeed,
            fetchPublicDocument: fetchReference,
            now
        });
    }
    const repository = deps.repository || createCardNewsProjectRepository({
        fs,
        path,
        workspaceDir: CONFIG.PATHS?.workspace
    });

    function getSelectableImageProviders() {
        const profiles = resolveStoredModelProfiles({
            ai_settings: { MODEL_PROFILES: CONFIG.AI_MODEL_PROFILES || {} }
        }, { imageSelection: CONFIG.IMAGE_MODEL_CONFIG || {} }).image;
        const catalog = getAiModelCatalog();
        const supportedModels = typeof deps.getSupportedImageModels === 'function'
            ? deps.getSupportedImageModels()
            : null;
        return Object.values(profiles)
            .map((stored) => resolveAiModelConfig({ ai_settings: { IMAGE_MODEL: stored } }, 'image'))
            .filter((profile) => hasSelectableImageCredentials(profile) && isConfiguredAiModel(profile) && isImageModelVerified(profile))
            .map((profile) => {
                const provider = String(profile.provider || '');
                const catalogModels = catalog.image.filter((model) => model.provider === provider);
                let models = catalogModels.length > 0
                    ? catalogModels
                    : [{ provider, code: profile.code, name: profile.name || profile.code }];
                if (Array.isArray(supportedModels)) {
                    const supportedIds = new Set(supportedModels
                        .filter((model) => model.provider === provider)
                        .map((model) => String(model.code || '')));
                    models = models.filter((model) => supportedIds.has(String(model.code || '')));
                }
                if (!models.length) return null;
                return {
                    provider,
                    name: catalog.providers.image.find((item) => item.id === provider)?.name || (provider === 'direct' ? '직접 입력' : provider),
                    models: models.map((model) => ({
                        provider,
                        code: String(model.code || ''),
                        name: String(model.name || model.code || ''),
                        identity: imageModelIdentity({ provider, code: model.code })
                    }))
                };
            }).filter(Boolean);
    }

    function resolveImageModelSelection(selection) {
        if (!selection || typeof selection !== 'object') {
            const current = CONFIG.IMAGE_MODEL_CONFIG || {};
            if (!isConfiguredAiModel(current)) {
                throw createApiError('CARD_NEWS_IMAGE_MODEL_UNAVAILABLE', '선택한 이미지 모델을 찾을 수 없습니다. 기본 이미지 모델 또는 다른 연결된 모델을 선택해 주세요.');
            }
            return {
                provider: String(current.provider || '').trim().toLowerCase(),
                code: String(current.code || '').trim(),
                transport: String(current.transport || '').trim()
            };
        }
        const provider = String(selection.provider || '').trim().toLowerCase();
        const code = String(selection.code || '').trim();
        const profiles = resolveStoredModelProfiles({
            ai_settings: { MODEL_PROFILES: CONFIG.AI_MODEL_PROFILES || {} }
        }, { imageSelection: CONFIG.IMAGE_MODEL_CONFIG || {} }).image;
        const providerProfile = profiles[provider]
            ? resolveAiModelConfig({ ai_settings: { IMAGE_MODEL: profiles[provider] } }, 'image')
            : null;
        const definition = getAiModelCatalog().image.find((item) => item.provider === provider && item.code === code);
        const model = providerProfile && definition
            ? { ...definition, api_key: providerProfile.api_key }
            : providerProfile?.code === code ? providerProfile : null;
        if (!model || !hasSelectableImageCredentials(providerProfile || {}) || !isConfiguredAiModel(model)) {
            throw createApiError('CARD_NEWS_IMAGE_MODEL_UNAVAILABLE', '선택한 이미지 모델을 찾을 수 없습니다. 기본 이미지 모델 또는 다른 연결된 모델을 선택해 주세요.');
        }
        if (!isImageModelVerified(providerProfile)) {
            throw createApiError('CARD_NEWS_IMAGE_MODEL_UNVERIFIED', '선택한 이미지 모델의 연결 확인이 만료되었거나 실패했습니다. 설정에서 연결을 확인한 뒤 다시 선택해 주세요.');
        }
        return {
            provider: String(model.provider || '').trim().toLowerCase(),
            code: String(model.code || '').trim(),
            transport: String(model.transport || '').trim()
        };
    }
    const generationService = deps.generationService || null;
    const publishingService = deps.publishingService || (
        generationService
        && deps.socialPublisher
        && deps.mediaTransport
            ? createCardNewsPublishingService({
                CONFIG,
                generationService,
                socialPublisher: deps.socialPublisher,
                mediaTransport: deps.mediaTransport,
                urlService: deps.urlService,
                prepareAssets: (assets, signature, expectedSignature, previewToken) => outgoingImageService.prepareAssets(
                    assets,
                    signature,
                    expectedSignature,
                    { previewToken }
                ),
                fileSystem: fs,
                pathApi: path,
                logger
            })
            : null
    );
    const ledgerSync = deps.ledgerSync || createCardNewsLedgerSyncService({
        store: deps.ledgerStore,
        logger,
        now
    });
    const ledgerRegistrationTimeoutMs = Number(
        deps.ledgerRegistrationTimeoutMs || CARD_NEWS_LEDGER_REGISTRATION_TIMEOUT_MS
    );
    let activeCardNewsGenerationExecution = '';
    const generationOperationManager = createAiGenerationOperationManager({
        coordinator: {
            acquire() {
                if (activeCardNewsGenerationExecution) return null;
                const executionId = `card-news-${createId()}`;
                activeCardNewsGenerationExecution = executionId;
                let released = false;
                return {
                    executionId,
                    release() {
                        if (released) return;
                        released = true;
                        if (activeCardNewsGenerationExecution === executionId) activeCardNewsGenerationExecution = '';
                    }
                };
            }
        },
        createError: (status, code, message) => createApiError(code, message, status),
        now: () => new Date(now())
    });

    async function listSources() {
        try {
            const result = await sourceService.discoverConfiguredArticles(CONFIG);
            const registrationOutcome = await settleWithin(
                ledgerSync.registerSources(result.articles),
                ledgerRegistrationTimeoutMs
            );
            if (registrationOutcome.timedOut) {
                logger?.warn?.(`⚠️ [CardNews] 관리대장 RSS 동기화가 ${ledgerRegistrationTimeoutMs}ms 안에 끝나지 않아 원문 목록을 먼저 반환합니다.`);
            }
            return {
                ...result,
                articles: limitArticlesPerPlatform(
                    ledgerSync.annotateSources?.(result.articles, registrationOutcome.value) || result.articles
                )
            };
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 소스 목록 조회 실패: ${error.message}`);
            throw toCardNewsError(error, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.');
        }
    }

    async function listManagedItems() {
        let rows = [];
        try {
            const rowsOutcome = await settleWithin(
                ledgerSync.listManagedRows?.() || [],
                ledgerRegistrationTimeoutMs
            );
            rows = Array.isArray(rowsOutcome.value) ? rowsOutcome.value : [];
            if (rowsOutcome.timedOut) {
                logger?.warn?.(`⚠️ [CardNews] 관리대장 목록 조회가 ${ledgerRegistrationTimeoutMs}ms 안에 끝나지 않아 로컬 결과를 먼저 반환합니다.`);
            }
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 관리대장 목록 조회 실패, 로컬 결과로 전환: ${error.message}`);
        }
        const items = rows.map((row) => {
            let generation = null;
            try { generation = generationService?.getGeneration?.(row.generationId) || null; } catch (error) {
                logger?.warn?.(`⚠️ [CardNews] 로컬 결과 확인 실패 (${row.generationId}): ${error.message}`);
            }
            return summarizeManagedCardNews(row, generation);
        });
        const knownGenerationIds = new Set(items.map((item) => item.generation_id).filter(Boolean));
        const localItems = (generationService?.listGenerations?.() || [])
            .filter((generation) => !knownGenerationIds.has(String(generation.id || '')))
            .map(summarizeLocalCardNews);
        const managedItems = [...items, ...localItems]
            .sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
        const statusCounts = managedItems.reduce((counts, item) => {
            const status = String(item.status || '확인 필요');
            counts[status] = (counts[status] || 0) + 1;
            return counts;
        }, {});
        logger?.info?.(`[CardNews] managed list ready (items=${managedItems.length}, statuses=${JSON.stringify(statusCounts)})`);
        return {
            items: managedItems
        };
    }

    function getGeneration(generationId) {
        if (!generationService?.getGeneration) {
            throw createApiError('CARD_NEWS_GENERATION_UNAVAILABLE', '카드뉴스 결과 조회 기능이 준비되지 않았습니다.', 500);
        }
        try {
            const generation = generationService.getGeneration(generationId);
            const project = generation.project_id ? repository.get(generation.project_id) : null;
            return { generation, source_snapshot: project?.source_snapshot || null };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_GENERATION_NOT_FOUND', '카드뉴스 결과를 찾지 못했습니다.');
        }
    }

    async function previewSource(input = {}) {
        if (!input?.source || typeof input.source !== 'object') {
            throw createApiError('CARD_NEWS_SOURCE_REQUIRED', '카드뉴스로 만들 내용을 선택하거나 입력해 주세요.');
        }
        try {
            const sourceSnapshot = await sourceService.resolveSourceSnapshot(input.source);
            if (sourceSnapshot.source?.kind === 'manuscript' && !sourceSnapshot.source.management_id) {
                sourceSnapshot.source = {
                    ...sourceSnapshot.source,
                    management_id: createId()
                };
            }
            return { source_snapshot: sourceSnapshot };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_SOURCE_PREVIEW_FAILED', '선택한 내용을 확인하지 못했습니다.');
        }
    }

    async function createProject(input = {}) {
        const { source_snapshot: sourceSnapshot } = await previewSource(input);
        const project = createCardNewsProject({
            title: input.title,
            source_snapshot: sourceSnapshot
        }, { createId, now });
        try {
            return { project: summarizeProject(repository.save(project)) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PROJECT_SAVE_FAILED', '카드뉴스 프로젝트를 저장하지 못했습니다.');
        }
    }

    function listProjects() {
        try {
            return { projects: repository.list().map(summarizeProject) };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PROJECT_LIST_FAILED', '카드뉴스 프로젝트 목록을 불러오지 못했습니다.');
        }
    }

    async function generate(input = {}) {
        if (!generationService) {
            throw createApiError('CARD_NEWS_GENERATION_UNAVAILABLE', '카드뉴스 생성 기능이 준비되지 않았습니다.', 500);
        }
        if (!isConfiguredAiModel(CONFIG.TEXT_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_TEXT_MODEL_REQUIRED', '설정에서 글쓰기 AI를 먼저 연결해 주세요.');
        }
        const imageModelConfig = normalizeImageMode(input.image_mode) === 'generate'
            ? resolveImageModelSelection(input.image_model_selection)
            : {};
        try {
            let project;
            const projectId = String(input.project_id || '').trim();
            if (projectId) {
                project = repository.get(projectId);
                if (!project?.source_snapshot) {
                    throw createApiError('CARD_NEWS_PROJECT_NOT_FOUND', '이어 만들 카드뉴스의 원문을 찾지 못했습니다.', 404);
                }
            } else {
                const sourceSnapshot = validateSourceSnapshot(input.source_snapshot);
                project = repository.save(createCardNewsProject({
                    source_snapshot: sourceSnapshot
                }, { createId, now }));
            }
            const generated = await generationService.generate({
                ...input,
                imageModelConfig,
                project_id: project.id,
                source_snapshot: project.source_snapshot
            });
            const generation = {
                ...generated,
                project_id: generated.project_id || project.id
            };
            await ledgerSync.recordGeneration(project.source_snapshot, generation);
            return { generation };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_GENERATION_FAILED', '카드뉴스를 만들지 못했습니다. 설정한 AI 모델을 확인한 뒤 다시 시도해 주세요.');
        }
    }

    function startCompositionOperation(input = {}) {
        if (!generationService?.generate) {
            throw createApiError('CARD_NEWS_GENERATION_UNAVAILABLE', '카드뉴스 생성 기능이 준비되지 않았습니다.', 500);
        }
        if (!isConfiguredAiModel(CONFIG.TEXT_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_TEXT_MODEL_REQUIRED', '설정에서 글쓰기 AI를 먼저 연결해 주세요.');
        }
        const imageModelConfig = normalizeImageMode(input.image_mode) === 'generate'
            ? resolveImageModelSelection(input.image_model_selection)
            : {};
        return generationOperationManager.start({
            source: 'card_news_composition_generation',
            failureCode: 'MANUSCRIPT_AI_GENERATE_FAILED',
            subject: String(input.source_snapshot?.title || '카드뉴스 구성').trim().slice(0, 120),
            message: '카드뉴스 구성 생성 중',
            remoteJobPossible: normalizeImageMode(input.image_mode) === 'generate'
                && String(imageModelConfig?.transport || '').includes('kie')
        }, async (operation) => generate({
            ...input,
            signal: operation.signal,
            reportProgress: operation.setProgress,
            beginCommit: () => operation.beginCommit()
        }));
    }

    async function generateImages(input = {}) {
        if (!generationService?.generateImages) {
            throw createApiError('CARD_NEWS_IMAGE_GENERATION_UNAVAILABLE', '카드 이미지 생성 기능이 준비되지 않았습니다.', 500);
        }
        const imageModelConfig = resolveImageModelSelection(input.image_model_selection);
        try {
            const generation = await generationService.generateImages({ ...input, imageModelConfig });
            await ledgerSync.recordGenerationProgress(generation);
            return { generation };
        } catch (error) {
            if (error?.code === 'AI_GENERATION_CANCELED') throw error;
            throw toCardNewsError(error, 'CARD_NEWS_IMAGE_GENERATION_FAILED', '카드 이미지를 만들지 못했습니다. 다시 시도해 주세요.');
        }
    }

    function startImageOperation(input = {}) {
        if (!generationService?.generateImages) {
            throw createApiError('CARD_NEWS_IMAGE_GENERATION_UNAVAILABLE', '카드 이미지 생성 기능이 준비되지 않았습니다.', 500);
        }
        const imageModelConfig = resolveImageModelSelection(input.image_model_selection);
        const generation = generationService.getGeneration?.(input.generation_id);
        return generationOperationManager.start({
            source: 'card_news_image_generation',
            failureCode: 'MANUSCRIPT_AI_GENERATE_FAILED',
            subject: String(generation?.title || '카드뉴스 이미지'),
            message: '카드뉴스 이미지 생성 중',
            remoteJobPossible: String(imageModelConfig?.transport || '').includes('kie')
        }, async (operation) => {
            try {
                const result = await generateImages({
                    ...input,
                    imageModelConfig,
                    signal: operation.signal,
                    reportProgress: operation.setProgress,
                    beginCommit: () => operation.beginCommit()
                });
                return result;
            } catch (error) {
                if (error?.code === 'AI_GENERATION_CANCELED') {
                    try {
                        const latest = generationService.getGeneration(input.generation_id);
                        await ledgerSync.recordGenerationProgress(latest);
                    } catch (syncError) {
                        logger?.warn?.(`⚠️ [CardNews] 중지된 이미지 진행 상태 동기화 실패: ${syncError.message}`);
                    }
                }
                throw error;
            }
        });
    }

    function getImageOperation(operationId) {
        return generationOperationManager.get(operationId);
    }

    function getCompositionOperation(operationId) {
        return generationOperationManager.get(operationId);
    }

    function cancelImageOperation(operationId) {
        return generationOperationManager.cancel(operationId);
    }

    function cancelCompositionOperation(operationId) {
        return generationOperationManager.cancel(operationId);
    }

    async function importLocalImage(input = {}) {
        if (!generationService?.importLocalImage) {
            throw createApiError('CARD_NEWS_IMAGE_IMPORT_UNAVAILABLE', '로컬 이미지 적용 기능이 준비되지 않았습니다.', 500);
        }
        try {
            const generation = generationService.importLocalImage(input);
            await ledgerSync.recordGenerationProgress(generation);
            return { generation };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_IMAGE_IMPORT_FAILED', '선택한 이미지를 적용하지 못했습니다.');
        }
    }

    function previewZip(input = {}) {
        if (!generationService?.previewZip) {
            throw createApiError('CARD_NEWS_ZIP_IMPORT_UNAVAILABLE', 'ZIP 가져오기 기능이 준비되지 않았습니다.', 500);
        }
        try {
            return generationService.previewZip(input);
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_ZIP_PREVIEW_FAILED', 'ZIP 파일을 확인하지 못했습니다.');
        }
    }

    async function importZip(input = {}) {
        if (!generationService?.importZip) {
            throw createApiError('CARD_NEWS_ZIP_IMPORT_UNAVAILABLE', 'ZIP 가져오기 기능이 준비되지 않았습니다.', 500);
        }
        const managementId = createId();
        try {
            const generation = generationService.importZip({ ...input, management_id: managementId });
            const title = String(generation.title || input.title || '').trim().slice(0, 300);
            const sourceUrl = String(generation.source_url || input.source_url || '').trim();
            const source = sourceUrl
                ? { kind: 'url', canonical_url: sourceUrl, title }
                : { kind: 'manuscript', management_id: managementId, title };
            await (ledgerSync.recordImportedGeneration || ledgerSync.recordGeneration)({
                source,
                title,
                canonical_url: sourceUrl,
                retrieved_at: now()
            }, generation);
            return { generation };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_ZIP_IMPORT_FAILED', 'ZIP 카드뉴스를 가져오지 못했습니다.');
        }
    }

    function resolveAsset(generationId, fileName) {
        return generationService?.resolveAsset(generationId, fileName) || null;
    }

    async function getSignaturePolicy(signature = '') {
        return outgoingImageService.getSignaturePolicy(signature, { force: true });
    }

    async function prepareAsset(generationId, fileName, signature = '', expectedSignature, options = {}) {
        const asset = resolveAsset(generationId, fileName);
        if (!asset) return null;
        return outgoingImageService.prepareAssets([asset], signature, expectedSignature, options).then((prepared) => prepared[0]);
    }

    async function createExportBundle(generationId, signature = '', expectedSignature, previewToken = '') {
        if (!generationService?.createExportBundle) {
            throw createApiError('CARD_NEWS_EXPORT_UNAVAILABLE', '전체 이미지 받기 기능이 준비되지 않았습니다.', 500);
        }
        try {
            if (typeof generationService.resolveCompleteAssets !== 'function') {
                return generationService.createExportBundle(generationId);
            }
            const { assets } = generationService.resolveCompleteAssets(generationId);
            const prepared = await outgoingImageService.prepareAssets(
                assets,
                signature,
                expectedSignature,
                previewToken ? { previewToken } : { force: true }
            );
            const assetDataByName = Object.fromEntries(prepared.map((asset) => [asset.file_name, asset.buffer]));
            return generationService.createExportBundle(generationId, { assetDataByName });
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_EXPORT_FAILED', '전체 이미지를 준비하지 못했습니다.');
        }
    }

    async function getPublishingConfig(generationId, organizationId) {
        if (!publishingService?.getConfig) {
            throw createApiError('CARD_NEWS_PUBLISHING_UNAVAILABLE', '카드뉴스 SNS 발행 기능이 준비되지 않았습니다.', 500);
        }
        try {
            return await publishingService.getConfig(generationId, organizationId);
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PUBLISHING_CONFIG_FAILED', '카드뉴스 발행 설정을 확인하지 못했습니다.');
        }
    }

    async function publish(input = {}) {
        if (!publishingService?.publish) {
            throw createApiError('CARD_NEWS_PUBLISHING_UNAVAILABLE', '카드뉴스 SNS 발행 기능이 준비되지 않았습니다.', 500);
        }
        if (!String(input.preview_token || '')) {
            throw createApiError('CARD_NEWS_SIGNATURE_PREVIEW_STALE', '미리보기 확인 정보가 없습니다. 미리보기를 새로고침한 뒤 다시 진행해 주세요.', 409);
        }
        try {
            const result = await publishingService.publish(input);
            await ledgerSync.recordPublishing(input.generation_id || input.generationId, result);
            logger?.info?.(`[CardNews] publish ledger recorded (confirmed=${Boolean(result.confirmed)}, success=${Number(result.success_count || 0)}, failure=${Number(result.failure_count || 0)})`);
            return result;
        } catch (error) {
            await ledgerSync.recordPublishingFailure(input.generation_id || input.generationId, error);
            throw toCardNewsError(error, 'CARD_NEWS_PUBLISH_FAILED', '카드뉴스를 SNS에 발행하지 못했습니다.');
        }
    }

    return {
        listImageModels() {
            const globalModel = CONFIG.IMAGE_MODEL_CONFIG || {};
            return {
                default: {
                    provider: String(globalModel.provider || ''),
                    code: String(globalModel.code || ''),
                    name: String(globalModel.name || globalModel.code || ''),
                    configured: isConfiguredAiModel(globalModel)
                },
                providers: getSelectableImageProviders()
            };
        },
        listSources,
        listManagedItems,
        getGeneration,
        previewSource,
        createProject,
        listProjects,
        generate,
        startCompositionOperation,
        getCompositionOperation,
        cancelCompositionOperation,
        generateImages,
        startImageOperation,
        getImageOperation,
        cancelImageOperation,
        importLocalImage,
        previewZip,
        importZip,
        resolveAsset,
        getSignaturePolicy,
        prepareAsset,
        createExportBundle,
        getPublishingConfig,
        publish
    };
}

module.exports = {
    CARD_NEWS_LEDGER_REGISTRATION_TIMEOUT_MS,
    CARD_NEWS_SOURCE_LIMIT,
    createCardNewsService,
    limitArticlesPerPlatform,
    summarizeProject,
    isConfiguredAiModel,
    cardNewsManagementStatus,
    summarizeManagedCardNews,
    summarizeLocalCardNews
};
