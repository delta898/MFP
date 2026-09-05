const crypto = require('node:crypto');
const { createCardNewsSourceService } = require('../../card-news/source-service');
const { createCardNewsProject } = require('../../card-news/project');
const { createCardNewsProjectRepository } = require('../../card-news/project-repository');
const { createCardNewsGenerationService } = require('../../card-news/generation-service');
const { createCardNewsPublishingService } = require('../../card-news/publishing-service');
const { createCardNewsLedgerSyncService } = require('../../card-news/ledger-sync-service');
const { createCardNewsFeedFetcher } = require('../../card-news/feed-fetcher');
const { normalizeImageMode } = require('../../card-news/generation');
const { createStyleReferenceFetcher } = require('../../content/style-reference-fetcher');

const CARD_NEWS_SOURCE_LIMIT = 30;

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

function cardNewsManagementStatus(row = {}) {
    const publishing = String(row.publishingStatus || '미발행');
    if (publishing === '실패' || publishing === '일부 완료' || String(row.lastError || '').trim()) return '확인 필요';
    if (publishing === '발행 완료') return '발행 완료';
    if (String(row.workflowStatus || '') === '제작 완료') return '발행 대기';
    return '작업 중';
}

function splitLedgerValues(value = '') {
    return String(value || '').split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function summarizeManagedCardNews(row = {}, generation = null) {
    const cards = Array.isArray(generation?.cards) ? generation.cards : [];
    return {
        generation_id: String(row.generationId || ''),
        title: String(row.title || generation?.title || '제목 없는 카드뉴스'),
        source_platform: String(row.sourcePlatform || ''),
        source_url: String(row.originalUrl || generation?.source_url || ''),
        status: cardNewsManagementStatus(row),
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

function createCardNewsService(deps = {}) {
    const {
        CONFIG = {},
        axios,
        cheerio,
        fs,
        path,
        logger,
        Utils,
        now = () => new Date().toISOString(),
        createId = () => crypto.randomUUID()
    } = deps;

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
    const generationService = deps.generationService || (Utils ? createCardNewsGenerationService({
        fs,
        path,
        workspaceDir: CONFIG.PATHS?.workspace,
        callWritingText: Utils.callWritingText.bind(Utils),
        callWritingImage: Utils.callWritingImage.bind(Utils),
        parseStructuredJsonResponse: Utils.parseStructuredJsonResponse,
        logger,
        now,
        createId
    }) : null);
    const publishingService = deps.publishingService || (
        generationService
        && deps.bufferClient
        && typeof deps.createWordPressClient === 'function'
            ? createCardNewsPublishingService({
                CONFIG,
                generationService,
                bufferClient: deps.bufferClient,
                createWordPressClient: deps.createWordPressClient,
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

    async function listSources() {
        try {
            const result = await sourceService.discoverConfiguredArticles(CONFIG);
            const registration = await ledgerSync.registerSources(result.articles);
            return {
                ...result,
                articles: limitArticlesPerPlatform(ledgerSync.annotateSources?.(result.articles, registration) || result.articles)
            };
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 소스 목록 조회 실패: ${error.message}`);
            throw toCardNewsError(error, 'CARD_NEWS_SOURCES_FAILED', '블로그 글 목록을 불러오지 못했습니다.');
        }
    }

    async function listManagedItems() {
        const rows = await ledgerSync.listManagedRows?.() || [];
        const items = rows.map((row) => {
            let generation = null;
            try { generation = generationService?.getGeneration?.(row.generationId) || null; } catch (error) {
                logger?.warn?.(`⚠️ [CardNews] 로컬 결과 확인 실패 (${row.generationId}): ${error.message}`);
            }
            return summarizeManagedCardNews(row, generation);
        }).sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)));
        return { items };
    }

    function getGeneration(generationId) {
        if (!generationService?.getGeneration) {
            throw createApiError('CARD_NEWS_GENERATION_UNAVAILABLE', '카드뉴스 결과 조회 기능이 준비되지 않았습니다.', 500);
        }
        try {
            return { generation: generationService.getGeneration(generationId) };
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
        if (normalizeImageMode(input.image_mode) === 'generate' && !isConfiguredAiModel(CONFIG.IMAGE_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_IMAGE_MODEL_REQUIRED', '설정에서 이미지 AI를 먼저 연결해 주세요.');
        }
        try {
            const generation = await generationService.generate(input);
            await ledgerSync.recordGeneration(input.source_snapshot, generation);
            return { generation };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_GENERATION_FAILED', '카드뉴스를 만들지 못했습니다. 설정한 AI 모델을 확인한 뒤 다시 시도해 주세요.');
        }
    }

    async function generateImages(input = {}) {
        if (!generationService?.generateImages) {
            throw createApiError('CARD_NEWS_IMAGE_GENERATION_UNAVAILABLE', '카드 이미지 생성 기능이 준비되지 않았습니다.', 500);
        }
        if (!isConfiguredAiModel(CONFIG.IMAGE_MODEL_CONFIG)) {
            throw createApiError('CARD_NEWS_IMAGE_MODEL_REQUIRED', '설정에서 이미지 AI를 먼저 연결해 주세요.');
        }
        try {
            const generation = await generationService.generateImages(input);
            await ledgerSync.recordGenerationProgress(generation);
            return { generation };
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_IMAGE_GENERATION_FAILED', '카드 이미지를 만들지 못했습니다. 다시 시도해 주세요.');
        }
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

    function createExportBundle(generationId) {
        if (!generationService?.createExportBundle) {
            throw createApiError('CARD_NEWS_EXPORT_UNAVAILABLE', '전체 이미지 받기 기능이 준비되지 않았습니다.', 500);
        }
        try {
            return generationService.createExportBundle(generationId);
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_EXPORT_FAILED', '전체 이미지를 준비하지 못했습니다.');
        }
    }

    function getPublishingConfig(generationId) {
        if (!publishingService?.getConfig) {
            throw createApiError('CARD_NEWS_PUBLISHING_UNAVAILABLE', '카드뉴스 SNS 발행 기능이 준비되지 않았습니다.', 500);
        }
        try {
            return publishingService.getConfig(generationId);
        } catch (error) {
            throw toCardNewsError(error, 'CARD_NEWS_PUBLISHING_CONFIG_FAILED', '카드뉴스 발행 설정을 확인하지 못했습니다.');
        }
    }

    async function publish(input = {}) {
        if (!publishingService?.publish) {
            throw createApiError('CARD_NEWS_PUBLISHING_UNAVAILABLE', '카드뉴스 SNS 발행 기능이 준비되지 않았습니다.', 500);
        }
        try {
            const result = await publishingService.publish(input);
            await ledgerSync.recordPublishing(input.generation_id || input.generationId, result);
            return result;
        } catch (error) {
            await ledgerSync.recordPublishingFailure(input.generation_id || input.generationId, error);
            throw toCardNewsError(error, 'CARD_NEWS_PUBLISH_FAILED', '카드뉴스를 SNS에 발행하지 못했습니다.');
        }
    }

    return {
        listSources,
        listManagedItems,
        getGeneration,
        previewSource,
        createProject,
        listProjects,
        generate,
        generateImages,
        importLocalImage,
        previewZip,
        importZip,
        resolveAsset,
        createExportBundle,
        getPublishingConfig,
        publish
    };
}

module.exports = {
    CARD_NEWS_SOURCE_LIMIT,
    createCardNewsService,
    limitArticlesPerPlatform,
    summarizeProject,
    isConfiguredAiModel,
    cardNewsManagementStatus,
    summarizeManagedCardNews
};
